'use client';

import { cn } from '@/lib/utils';
import { Film, History, Images, Key } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavbarProps {
  hasApiKey: boolean;
  onApiKeyClick: () => void;
}

const navItems = [
  {
    href: '/',
    label: 'Workflow',
    icon: Film,
  },
  {
    href: '/image-gen',
    label: 'Image Gen',
    icon: Images,
  },
  {
    href: '/history',
    label: 'History',
    icon: History,
  },
];

export function Navbar({ hasApiKey, onApiKeyClick }: NavbarProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
      <div className="mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
            <img src="/gptproto.png" alt="GPTProto" className="w-5 h-5 object-contain" />
          </div>
          <span className="text-sm font-medium text-zinc-100">GPTProto</span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* API Key Button */}
        <button
          onClick={onApiKeyClick}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            hasApiKey
              ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              : 'text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
          )}
        >
          <Key className="w-4 h-4" />
          <span className="hidden sm:inline">{hasApiKey ? 'API Key' : 'Set API Key'}</span>
        </button>
      </div>
    </header>
  );
}
