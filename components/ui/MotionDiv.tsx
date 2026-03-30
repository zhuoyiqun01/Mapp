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
  layout?: boolean;
  layoutId?: string;
  /** 标记为布局投影的滚动容器，避免 layoutId 动画在 overflow-y 区域被裁切 */
  layoutScroll?: boolean;
  layoutRoot?: boolean;
};

export const MotionDiv = motion.div as unknown as React.ForwardRefExoticComponent<
  MotionDivProps & React.RefAttributes<HTMLDivElement>
>;
