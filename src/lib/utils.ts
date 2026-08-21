import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Fusionne des classes Tailwind en laissant la dernière l'emporter. */
export function cn(...entrees: ClassValue[]): string {
  return twMerge(clsx(entrees))
}
