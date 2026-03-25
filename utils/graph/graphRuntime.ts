import cytoscape, { type CytoscapeOptions } from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';

cytoscape.use(coseBilkent);

export { attachBoardlikeWheelZoom, GRAPH_WHEEL_ZOOM_SENSITIVITY } from './graphRuntimeCore';

const defaultUi: Pick<CytoscapeOptions, 'minZoom' | 'maxZoom' | 'wheelSensitivity'> = {
  minZoom: 0.15,
  maxZoom: 4,
  /** 关闭 Cytoscape 内置指数滚轮，由 `attachBoardlikeWheelZoom` 按看板思路接管 */
  wheelSensitivity: 0
};

/** 应用内关系图：已注册 cose-bilkent */
export function createAppGraphCy(
  container: HTMLElement,
  opts: Pick<CytoscapeOptions, 'elements' | 'style'>
): Core {
  return cytoscape({
    container,
    ...defaultUi,
    elements: opts.elements,
    style: opts.style
  });
}
