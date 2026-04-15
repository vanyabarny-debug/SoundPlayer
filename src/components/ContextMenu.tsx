import React from 'react';
import { motion } from 'motion/react';

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  isOpen: boolean;
  position?: { top: number; right: number };
}

export function ContextMenu({ items, isOpen, position }: ContextMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 z-20" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.15 }}
        style={position ? { top: position.top, right: position.right } : {}}
        className="absolute right-0 top-12 w-48 z-30 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md"
      >
        {/* Фоновый слой с виньеткой */}
        <div className="absolute inset-0 bg-zinc-800/80 backdrop-blur-sm" />
        
        {/* Виньетка - размытие кверху */}
        <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-transparent via-transparent to-zinc-800/0 pointer-events-none z-10" />
        
        {/* Содержимое меню */}
        <div className="relative z-20 border border-zinc-700/50">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors ${
                item.danger
                  ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300'
                  : 'hover:bg-zinc-700/50 text-white hover:text-white'
              } ${index !== items.length - 1 ? 'border-b border-zinc-700/30' : ''}`}
            >
              {item.icon && <span className="w-4 h-4">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
