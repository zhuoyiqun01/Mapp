/**
 * Property 注册表：描述编辑能力（read / write / 组件键），不是字段↔组件死绑定。
 * 首轮仅 emoji / tags / time；不做 validator / serializer / permissions。
 */

import type { Note, Tag } from '../../types';
import type { PropertyKey } from './editorModel';

export type PropertyWriteResult = Partial<Note>;

export interface PropertyDescriptor<T = unknown> {
  key: PropertyKey;
  read: (note: Partial<Note>) => T;
  write: (note: Partial<Note>, value: T) => PropertyWriteResult;
  /** 对应 UI 组件标识；实际渲染由 Section 决定 */
  component: 'EmojiEditor' | 'TagEditor' | 'TimeEditor';
}

export const emojiProperty: PropertyDescriptor<string> = {
  key: 'emoji',
  read: (note) => note.emoji || '',
  write: (_note, value) => ({ emoji: value }),
  component: 'EmojiEditor'
};

export const tagsProperty: PropertyDescriptor<Tag[]> = {
  key: 'tags',
  read: (note) => note.tags || [],
  write: (_note, value) => ({ tags: value }),
  component: 'TagEditor'
};

export type TimePropertyValue = { startYear?: number; endYear?: number };

export const timeProperty: PropertyDescriptor<TimePropertyValue> = {
  key: 'time',
  read: (note) => ({ startYear: note.startYear, endYear: note.endYear }),
  write: (_note, value) => ({
    startYear: value.startYear,
    endYear: value.endYear
  }),
  component: 'TimeEditor'
};

/** 首轮有序注册表 */
export const PROPERTY_REGISTRY = {
  emoji: emojiProperty,
  tags: tagsProperty,
  time: timeProperty
} as const;

export const PROPERTY_ORDER: PropertyKey[] = ['emoji', 'tags', 'time'];
