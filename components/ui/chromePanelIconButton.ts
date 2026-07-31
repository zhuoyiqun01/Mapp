/**
 * 玻璃面板上的小图标按钮样式约定。
 * 顶栏独立 `ChromeIconButton`（自带玻璃底）不在此列。
 */

/** 玻璃面板内嵌小 icon：无框（无填充底 / 无描边 / 无阴影），仅 hover 浅底 */
export const chromePanelGhostIconButtonClass =
  'inline-flex shrink-0 items-center justify-center rounded-md p-1 text-gray-500 outline-none transition-colors hover:bg-gray-100/80 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-gray-300/70 disabled:cursor-not-allowed disabled:opacity-40';
