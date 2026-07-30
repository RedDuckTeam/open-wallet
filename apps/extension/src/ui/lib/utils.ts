import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn class merger: clsx for conditionals, twMerge to de-dupe Tailwind classes.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
