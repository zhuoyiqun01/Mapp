# Note 字段能力表

编辑器分区：Content / Properties / Media / Metadata。存储仍为 Note 平铺字段。

| 字段 | 存储 | Editor | 用户编辑 | 派生 |
|------|------|--------|----------|------|
| text | `Note.text` | Content | 是 | 否 |
| displayTitle | 无 | Content | 否 | 是（`parseNoteContent` 首行） |
| detail | 无 | Content | 否 | 是（首行后） |
| emoji | `Note.emoji` | Property(`emoji`) | 是 | 否 |
| tags | `Note.tags` | Property(`tags`) | 是 | 否 |
| startYear / endYear | `Note.*Year` | Property(`time`) | 是 | 否 |
| images | `Note.images` | Media(`attachments` type=image) | 是 | 否 |
| sketch | `Note.sketch` | Media(`attachments` type=sketch) | 是 | 否 |
| isFavorite | `Note.isFavorite` | Header chrome | 是 | 否 |
| id | `Note.id` | Metadata | 否 | 否 |
| createdAt | `Note.createdAt` | Metadata | 否 | 否 |
| coords | `Note.coords` | 暂不进 Section | 否* | 否 |
| variant | `Note.variant` | 透传 | 否 | 否 |
| groupId(s) 等 | `Note.*` | Graph / Board | 否 | 否 |
| fontSize / isBold / color | `Note.*` | 保存写死默认 | 否 | 否 |

\* 定位地图按钮可读 coords，但不作为可编辑 Property。

适配器：`utils/note/editorModel.ts`（`toEditorModel` / `fromEditorModel`）。  
注册表：`utils/note/propertyRegistry.ts`。
