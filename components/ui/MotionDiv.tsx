import { motion } from 'framer-motion';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * framer-motion 11 + TS 5.8：`HTMLMotionProps<'div'>` 在部分版本下展开成 unknown，导致丢失 className。
 * 以原生 div 属性为底，并补充 AnimatePresence 常用的 motion 字段。
 */
export type MotionDivProps = ComponentPropsWithoutRef<'div'> & {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
  onAnimationComplete?: () => void;
};

export const MotionDiv = motion.div as unknown as React.ForwardRefExoticComponent<
  MotionDivProps & React.RefAttributes<HTMLDivElement>
>;
