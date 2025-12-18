# 视图切换时的位置和缩放逻辑总结

## 当前逻辑

### 1. 状态管理（App.tsx）

- `isFirstLoad`: 标记是否为首次加载
- `mapViewPosition`: 存储地图视图的位置 `{ center: [number, number], zoom: number }`
- `boardViewPosition`: 存储看板视图的位置 `{ x: number, y: number, scale: number }`
- `navigateToMapCoords`: 临时导航坐标（用于跨视图导航）
- `navigateToBoardCoords`: 临时导航坐标（用于跨视图导航）

### 2. MapView 初始位置逻辑

**优先级顺序**：
1. `navigateToCoords`（如果存在，优先使用，zoom = 19）
2. `savedPosition.center`（恢复保存的位置）
3. 最后一个 note 的坐标（如果有 notes）
4. `defaultCenter`（默认坐标 `[28.1847, 112.9467]`）

**初始缩放**：
1. `navigateToCoords` 存在时：zoom = 19
2. `savedZoom`（如果存在）
3. `savedPosition.zoom`（如果存在）
4. 默认 zoom = 16

**代码位置**：`MapView.tsx:2904-2911`

```typescript
center={
  isMapMode
    ? (navigateToCoords 
        ? [navigateToCoords.lat, navigateToCoords.lng]
        : (savedPosition?.center || (mapNotes.length > 0
            ? [mapNotes[mapNotes.length - 1].coords.lat, mapNotes[mapNotes.length - 1].coords.lng]
            : defaultCenter)))
    : [0, 0]
}
zoom={isMapMode ? (navigateToCoords ? 19 : (savedZoom ?? savedPosition?.zoom ?? 16)) : -8}
```

**MapNavigationHandler**：
- 当 `navigateToCoords` 存在时，使用 `setView` 动画导航到指定坐标
- 目标 zoom 固定为 19（最大 zoom，避免与其他标记合并）
- 动画完成后调用 `onNavigateComplete`

### 3. BoardView 初始位置逻辑

**初始 transform**：
```typescript
const [transform, setTransform] = useState(savedTransform || { x: 0, y: 0, scale: 1 });
```

**导航逻辑（优先级）**：
1. `navigateToCoords`（如果存在，计算合适的 scale 并动画到目标位置）
2. `savedTransform`（恢复保存的位置，如果没有 navigateToCoords）
3. 默认位置 `{ x: 0, y: 0, scale: 1 }`

**代码位置**：`BoardView.tsx:946-1004`

### 4. 视图切换逻辑（App.tsx）

#### 从 MapView 切换到 BoardView

```typescript
onSwitchToBoardView={(coords) => {
  setIsEditorOpen(false);
  requestAnimationFrame(() => {
    if (coords) {
      setNavigateToBoardCoords(coords);  // 优先使用提供的 coords
    } else if (!isFirstLoad && boardViewPosition) {
      // 如果不是首次加载且有保存的位置，恢复保存的位置
      setNavigateToBoardCoords({ x: boardViewPosition.x, y: boardViewPosition.y });
    }
    setViewMode('board');
  });
}}
```

#### 从 BoardView 切换到 MapView

```typescript
onSwitchToMapView={(coords?: { lat: number; lng: number }) => {
  setIsEditorOpen(false);
  setViewMode('map');
  if (coords) {
    setTimeout(() => {
      setNavigateToMapCoords(coords);  // 优先使用提供的 coords
    }, 100);
  } else if (!isFirstLoad && mapViewPosition) {
    // 如果不是首次加载且有保存的位置，恢复保存的位置
    setTimeout(() => {
      setNavigateToMapCoords({ 
        lat: mapViewPosition.center[0], 
        lng: mapViewPosition.center[1] 
      });
    }, 100);
  }
  // 注意：这里没有恢复 zoom，MapView 会使用 savedZoom 或 savedPosition.zoom
}}
```

### 5. 位置变化监听

**MapView**：
- `MapPositionTracker` 监听 `moveend` 和 `zoomend` 事件
- 调用 `onPositionChange` 回调更新 `mapViewPosition`

**BoardView**：
- `useEffect` 监听 `transform` 变化
- 调用 `onTransformChange` 回调更新 `boardViewPosition`
- 使用 `prevTransformRef` 和 `isRestoringRef` 防止循环更新

### 6. 首次加载逻辑

- `isFirstLoad` 初始为 `true`
- 首次加载时，`savedPosition` 和 `savedTransform` 被忽略（传 `null`）
- 使用默认规则（MapView: 最后一个 note 或 defaultCenter, zoom=16；BoardView: {x:0, y:0, scale:1}）
- 导航完成后，`setIsFirstLoad(false)`

## 潜在问题

1. **MapView 切换时的 zoom 恢复**：
   - 从 BoardView 切换到 MapView 时，如果使用 `savedPosition`，zoom 会从 `savedPosition.zoom` 恢复
   - 但如果使用 `navigateToCoords`，zoom 固定为 19，不会恢复之前的 zoom
   - **建议**：如果 `navigateToCoords` 是从 note 点击触发的，使用 zoom=19 是合理的；但如果是从视图切换触发的，可能需要保留之前的 zoom

2. **BoardView 的 scale 恢复**：
   - 从 MapView 切换到 BoardView 时，如果使用保存的位置，scale 会从 `savedTransform.scale` 恢复
   - 但如果使用 `navigateToCoords`，scale 是重新计算的，不会恢复之前的 scale
   - **这可能是一个问题**：用户可能期望恢复之前的缩放级别

3. **首次加载的时机**：
   - `isFirstLoad` 在 `onNavigateComplete` 中被设置为 `false`
   - 但如果用户从未触发导航（例如，直接切换到视图），`isFirstLoad` 可能一直保持为 `true`
   - **这可能不是问题**，因为首次加载时的默认行为是合理的

## 建议改进

1. **MapView zoom 恢复**：
   - 考虑在 `navigateToCoords` 中增加可选的 zoom 参数
   - 或者，区分"导航到 note"（zoom=19）和"恢复视图"（使用保存的 zoom）

2. **BoardView scale 恢复**：
   - 考虑在恢复位置时也恢复 scale
   - 或者，提供一个选项来指定是否保持之前的 scale

3. **代码清理**：
   - 考虑将位置和缩放逻辑提取到单独的文件或 hook 中，提高可维护性

