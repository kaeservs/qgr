'use client';

import { Compass, Ellipsis, House, LifeBuoy, Radar, Settings, Sparkles, Workflow, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';
import type { User } from '@/lib/types';
import { Avatar } from '../ui/Avatar';
import styles from './shell.module.css';

const GROUPS = [
  {
    label: null,
    items: [
      { href: '/', label: 'Home', icon: House },
      { href: '/runs', label: 'Runs', icon: Workflow },
    ],
  },
  {
    label: 'Agents',
    items: [
      { href: '/competitors', label: 'Competitors', icon: Radar },
      { href: '/strategy', label: 'Strategy', icon: Compass },
      { href: '/content', label: 'Content', icon: Sparkles },
    ],
  },
  {
    label: null,
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/help', label: 'Help & support', icon: LifeBuoy },
    ],
  },
] as const;

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function Sidebar({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className={cx(styles.scrim, open && styles.scrimOpen)} onClick={onClose} aria-hidden />
      <div className={styles.sidebarCol}>
      <aside className={cx(styles.sidebar, open && styles.sidebarOpen)} aria-label="Main">
        <div className={styles.brand}>
          <Link href="/" className={styles.logo} onClick={onClose}>
            <Image src="/brand/qgr-logo.png" alt="Quantum Global, Residency and Citizenship" width={120} height={69} priority />
          </Link>
          <button type="button" className={cx('icon-btn', 'icon-btn-plain', styles.closeNav)} onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className={styles.nav}>
          {GROUPS.map((group, i) => (
            <div key={i} className={styles.group}>
              {group.label && <p className={styles.groupLabel}>{group.label}</p>}
              <ul>
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link href={href} className={cx(styles.item, active && styles.itemActive)} aria-current={active ? 'page' : undefined} onClick={onClose}>
                        <Icon size={20} strokeWidth={1.8} aria-hidden />
                        <span>{label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.user}>
          <Avatar name={user.name} size={40} brand />
          <div className={styles.userText}>
            <p className={styles.userName}>{user.name}</p>
            <p className={styles.userRole}>{user.role}</p>
          </div>
          <Link href="/settings" className="icon-btn icon-btn-plain" aria-label="Account settings" onClick={onClose}>
            <Ellipsis size={18} />
          </Link>
        </div>
      </aside>
      </div>
    </>
  );
}
