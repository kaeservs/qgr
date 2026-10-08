import { BlockList, isIPv4, isIPv6 } from 'node:net';

// Which network addresses the page reader may connect to: public internet
// only. A link someone pastes, or a redirect from it, must never reach this
// server's own network, a cloud metadata service or a home router. Checked
// against the address actually connected to (fetch.ts passes this to the
// socket's DNS lookup), so a name that resolves somewhere private is refused
// too, not just a typed IP.

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** The eight 16-bit groups of an IPv6 address, or null if it does not parse. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  // A trailing dotted IPv4 part (::ffff:1.2.3.4) is two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const v4 = dotted[1].split('.').map(Number);
    if (v4.some((n) => n > 255)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((g) => Number.parseInt(g, 16)));
  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [...head, ...Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const v4FromGroups = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/**
 * The IPv4 address an IPv6 address carries, when it is only a wrapper around
 * one: IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64
 * (64:ff9b::a.b.c.d) and 6to4 (2002:aabb:ccdd::). Each would otherwise let a
 * private IPv4 address through in disguise.
 */
function embeddedIPv4(groups: number[]): string | null {
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  const zeros = (...gs: (number | undefined)[]) => gs.every((g) => g === 0);
  if (zeros(g0, g1, g2, g3, g4) && (g5 === 0xffff || g5 === 0)) return v4FromGroups(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b && zeros(g2, g3, g4, g5)) return v4FromGroups(g6, g7);
  if (g0 === 0x2002 && g1 !== undefined && g2 !== undefined) return v4FromGroups(g1, g2);
  return null;
}

/** True only for an address on the public internet. Anything unparseable is not. */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return !blocked.check(address, 'ipv4');
  if (!isIPv6(address)) return false;
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const v4 = embeddedIPv4(groups);
  if (v4 !== null) return !blocked.check(v4, 'ipv4');
  return !blocked.check(address, 'ipv6');
}
