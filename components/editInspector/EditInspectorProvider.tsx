import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  EditInspectorPanel,
  type EditInspectorPanelProps
} from '../map/overlays/MapEditInspectorPanel';

type EditInspectorContextValue = {
  setPayload: (p: EditInspectorPanelProps | null) => void;
};

const EditInspectorContext = createContext<EditInspectorContextValue | null>(null);

/**
 * 全局唯一右侧编辑属性面板：子视图通过 `useRegisterEditInspector` 注册内容，勿在各视图内再渲染 `EditInspectorPanel`。
 */
export function EditInspectorProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<EditInspectorPanelProps | null>(null);
  const setPayloadStable = useCallback((p: EditInspectorPanelProps | null) => {
    setPayload(p);
  }, []);
  return (
    <EditInspectorContext.Provider value={{ setPayload: setPayloadStable }}>
      {children}
      {payload ? <EditInspectorPanel {...payload} /> : null}
    </EditInspectorContext.Provider>
  );
}

/** 当前激活视图在「编辑模式且应显示侧栏」为 true 时注册面板；卸载或 active 为 false 时自动清除。 */
export function useRegisterEditInspector(active: boolean, props: EditInspectorPanelProps) {
  const ctx = useContext(EditInspectorContext);
  if (!ctx) {
    throw new Error('useRegisterEditInspector must be used within EditInspectorProvider');
  }
  const { setPayload } = ctx;
  useEffect(() => {
    if (!active) {
      setPayload(null);
      return;
    }
    setPayload(props);
    return () => setPayload(null);
  }, [active, setPayload, props]);
}
