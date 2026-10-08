import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './address';

describe('isPublicAddress', () => {
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '104.16.132.229', '1.1.1.1', '2606:4700::6810:84e5', '2a00:1450:4001:82a::200e']) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it('refuses private, loopback, link-local and reserved IPv4', () => {
    for (const ip of ['127.0.0.1', '127.8.9.10', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.10', '198.18.0.1']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it('refuses the same in IPv6, and IPv4 wrapped in IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fe80::1%eth0', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:169.254.169.254', '64:ff9b::10.0.0.1', '2002:a00:1::', '::127.0.0.1']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it('allows a public IPv4 wrapped in IPv6', () => {
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicAddress('64:ff9b::808:808')).toBe(true);
  });

  it('refuses anything that is not an address', () => {
    for (const value of ['', 'localhost', 'example.com', '999.1.1.1', '1.2.3', 'gggg::1']) {
      expect(isPublicAddress(value), value).toBe(false);
    }
  });
});
