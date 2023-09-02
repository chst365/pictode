import { BaseService } from '@pictode/utils';
import Konva from 'konva';

import './polyfill';

import { Mouse } from './services/mouse';
import { Tooler } from './services/tooler';
import { AppConfig, EventArgs, KonvaNode, Plugin, Tool } from './types';
import { DEFAULT_APP_CONFIG, guid, Point } from './utils';

export class App extends BaseService<EventArgs> {
  public stage: Konva.Stage;
  public mainLayer: Konva.Layer;
  public containerElement: HTMLDivElement;
  public config: AppConfig;

  private mouse: Mouse;
  private tooler: Tooler;
  private installedPlugins: Map<string, Plugin> = new Map();
  private resizeObserver: ResizeObserver;

  constructor(config?: Partial<AppConfig>) {
    super();
    this.config = { ...DEFAULT_APP_CONFIG, ...config };
    this.containerElement = document.createElement('div');
    this.containerElement.setAttribute(
      'style',
      `
      width: 100%;
      height: 100%;
    `
    );
    this.stage = new Konva.Stage({
      container: this.containerElement,
      width: 500,
      height: 500,
    });
    this.stage.container().style.backgroundColor = '#fff';
    this.mainLayer = new Konva.Layer();
    this.mainLayer.name('pictode:main:layer');
    this.stage.add(this.mainLayer);

    this.tooler = new Tooler(this);
    this.mouse = new Mouse(this);
    this.resizeObserver = new ResizeObserver(this.onContainerResize);
    this.triggerPanning(this.config.panning.enabled);
    this.triggerMouseWheel(this.config.mousewheel.enabled);
  }

  private onContainerResize = (e: ResizeObserverEntry[]) => {
    const { width, height } = e[0].contentRect;
    this.stage.width(width);
    this.stage.height(height);
    this.render();
  };

  public get pointer(): Point {
    const { x, y } = this.stage.getRelativePointerPosition() ?? { x: 0, y: 0 };
    return new Point(x, y);
  }

  public get curTool(): Tool | null {
    return this.tooler.currentTool;
  }

  public mount(element: HTMLElement) {
    element.appendChild(this.containerElement);
    this.resizeObserver.observe(this.containerElement);
  }

  public async setTool(curTool: Tool): Promise<void> {
    await this.tooler.setTool(curTool);
  }

  public triggerPanning(enabled?: boolean): void {
    if (enabled === void 0) {
      this.stage.draggable(this.stage.draggable());
    } else {
      this.stage.draggable(enabled);
    }
    if (this.stage.draggable()) {
      this.stage.container().style.cursor = this.config.panning.cursor ?? 'grabbing';
    } else {
      this.stage.container().style.cursor = 'default';
    }
  }

  public triggerMouseWheel(enabled?: boolean): void {
    if (enabled === void 0) {
      this.config.mousewheel.enabled = !this.config.mousewheel.enabled;
    } else {
      this.config.mousewheel.enabled = enabled;
    }
  }

  public triggerTool(enabled?: boolean): void {
    this.tooler.trigger(enabled);
  }

  public add(...nodes: Array<KonvaNode>): void {
    this._add(...nodes);
    this.emit('node:added', { nodes: nodes });
  }

  public _add(...nodes: Array<KonvaNode>): void {
    this.mainLayer.add(
      ...nodes.map((node) => {
        if (!node.attrs.id) {
          node.id(`#${guid()}`);
        }
        return node;
      })
    );
    this.render();
  }

  public remove(...nodes: Array<KonvaNode>): void {
    this._remove(...nodes);
    this.emit('node:removed', { nodes: nodes });
  }

  public _remove(...nodes: Array<KonvaNode>): void {
    nodes.forEach((node) => {
      node.remove();
    });
    this.render();
  }

  public update(...nodes: Array<KonvaNode>): void {
    const getNodes = (nodes: Array<KonvaNode>): KonvaNode[] =>
      nodes.reduce<Array<KonvaNode>>((result, node) => {
        const originNode = this.getNodeById(node.attrs.id);
        if (originNode) {
          result.push(originNode);
        }
        return result;
      }, []);
    this.emit('node:update:before', { nodes: getNodes(nodes) });
    this._update(...nodes);
    this.emit('node:updated', { nodes: getNodes(nodes) });
  }

  public _update(...nodes: Array<KonvaNode>): void {
    nodes.forEach((node) => {
      const originNode = this.getNodeById(node.attrs.id);
      originNode?.setAttrs(node.attrs);
    });
    this.render();
  }

  public makeGroup(nodes: Array<KonvaNode>): Konva.Group | KonvaNode[] {
    if (nodes.length < 2) {
      return nodes;
    }
    const group = new Konva.Group({ draggable: true });
    group.add(
      ...nodes.map((node) => {
        node.draggable(false);
        return node;
      })
    );
    this.add(group);
    return group;
  }

  public decomposeGroup(group: Konva.Group): KonvaNode[] {
    const parent = group.parent;
    const groupTransform = group._getTransform();
    const resolve = (group.children ?? []).map((child) => {
      const childTransform = child._getTransform();
      const transform = childTransform.multiply(groupTransform);
      child._setTransform(transform.decompose());
      return child;
    });
    parent?.add(...resolve);
    group.remove();
    return resolve;
  }

  public moveUp(...nodes: Array<KonvaNode>): void {
    this.moveZIndexNodes(nodes, (node) => node.moveUp());
  }

  public moveDown(...nodes: Array<KonvaNode>): void {
    this.moveZIndexNodes(nodes, (node) => node.moveDown());
  }

  public moveTop(...nodes: Array<KonvaNode>): void {
    this.moveZIndexNodes(nodes, (node) => node.moveToTop());
  }

  public moveBottom(...nodes: Array<KonvaNode>): void {
    nodes.forEach((node) => node.moveToBottom());
    this.moveZIndexNodes(nodes, (node) => node.moveToBottom());
  }

  private moveZIndexNodes(nodes: Array<KonvaNode>, handler: (node: KonvaNode) => void): void {
    const eventPayload = nodes.map((node) => {
      const result = {
        node,
        oldZIndex: node.getZIndex(),
        newZIndex: node.getZIndex(),
      };
      handler(node);
      result.newZIndex = node.getZIndex();
      return result;
    });
    if (eventPayload.some(({ oldZIndex, newZIndex }) => oldZIndex !== newZIndex)) {
      this.emit('node:zindex:changed', { nodes: eventPayload });
    }
  }

  public getNodeById(id: string): KonvaNode | undefined {
    return this.getNodes((node) => node.id() === id)?.[0];
  }

  public getNodes(callback: (node: KonvaNode) => boolean): KonvaNode[] {
    return this.mainLayer.find(callback) ?? [];
  }

  public isPointInArea(point: Point, area: { width: number; height: number; x: number; y: number }): boolean {
    const { width, height, x, y } = area;
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }

  public getShapesInArea(shape: Konva.Shape): KonvaNode[] {
    return this.mainLayer.getChildren(
      (node) => node.visible() && node !== shape && this.haveIntersection(shape, node as Konva.Shape)
    );
  }

  public haveIntersection(shape1: Konva.Shape, shape2: Konva.Shape): boolean {
    /** getClientRect()方法用于获取图形的边界矩形（bounding rectangle）。
     * 假设你有一个Konva.js的舞台（stage）和多个图形（shapes），这些图形有可能被嵌套在不同的容器中，
     * 而容器又被嵌套在其他容器中。如果你想获取某个图形相对于舞台的边界矩形，直接使用shape.getClientRect()将会得到相对于该图形自身的边界矩形。
     * 而这并不能满足你对整个舞台上图形相对位置的需求。
     * 但是，通过设置relativeTo: stage参数，shape.getClientRect({relativeTo: stage})将会返回该图形相对于舞台的边界矩形，
     * 这样你就能够正确获取图形在整个舞台上的相对位置和尺寸信息。
     * 这对于一些场景很重要，例如碰撞检测、相交检测、拖放功能等。
     * 使用relativeTo参数，可以在复杂的图形结构中正确地定位图形，并在需要时进行适当的计算。这样就可以更灵活和准确地处理图形之间的交互。
     *
     */
    const r1 = shape1.getClientRect({ relativeTo: this.stage });
    const r2 = shape2.getClientRect({ relativeTo: this.stage });
    // 判断r2的四个角点是否都在r1内部
    const topLeftContained = r1.x <= r2.x && r1.y <= r2.y;
    const topRightContained = r1.x + r1.width >= r2.x + r2.width && r1.y <= r2.y;
    const bottomLeftContained = r1.x <= r2.x && r1.y + r1.height >= r2.y + r2.height;
    const bottomRightContained = r1.x + r1.width >= r2.x + r2.width && r1.y + r1.height >= r2.y + r2.height;

    // 如果r2的四个角点都在r1内部，则认为r2完全包含在r1内部
    return topLeftContained && topRightContained && bottomLeftContained && bottomRightContained;
  }

  public render(): void {
    this.mainLayer.draw();
  }

  public scale(): number {
    return this.stage.scaleX();
  }

  public scaleTo(scale: number, pointer: Point = new Point(0, 0)): void {
    const oldScale = this.scale();
    this.emit('canvas:zoom:start', { scale: oldScale });
    const newScale = Math.min(Math.max(scale, this.config.scale.min), this.config.scale.max);
    const mousePointTo = new Point((pointer.x - this.stage.x()) / oldScale, (pointer.y - this.stage.y()) / oldScale);
    this.stage.scale({ x: newScale, y: newScale });
    this.stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
    this.emit('canvas:zoom:end', { scale: this.scale() });
  }

  public clear(): void {
    this.mainLayer.removeChildren();
    this.emit('canvas:cleared', {});
    this.render();
  }

  public async toDataURL(
    nodes?: Array<KonvaNode>,
    config?: {
      padding?: number;
      pixelRatio?: number;
      mimeType?: string;
      quality?: number;
      haveBackground?: boolean;
    }
  ): Promise<{ dataURL: string; width: number; height: number }> {
    const { padding = 10, pixelRatio = 2, mimeType = 'image/png', quality = 1, haveBackground = false } = config ?? {};

    const exportLayer = new Konva.Layer();

    this.stage.add(exportLayer);

    let objects = [];
    if (nodes && nodes.length > 0) {
      objects = nodes.map((object) => object.toObject());
    } else {
      objects = this.mainLayer.children?.map((object) => object.toObject()) ?? [];
    }

    const newNodes = objects.map((object) => Konva.Node.create(object));
    exportLayer.add(...newNodes);

    const transformer = new Konva.Transformer({ rotateAnchorOffset: 0 });
    transformer.nodes(newNodes);

    const clientRect = transformer.getClientRect();
    const width = clientRect.width + padding * 2;
    const height = clientRect.height + padding * 2;
    const x = clientRect.x - padding;
    const y = clientRect.y - padding;

    const background = new Konva.Rect({
      width,
      height,
      x,
      y,
      fill: this.stage.container().style.backgroundColor,
    });

    if (haveBackground) {
      exportLayer.add(background);
      background.moveToBottom();
    }
    return new Promise((resolve, reject) => {
      try {
        exportLayer.toDataURL({
          width,
          height,
          x,
          y,
          pixelRatio,
          mimeType,
          quality,
          callback: (str) => {
            resolve({
              dataURL: str,
              width,
              height,
            });
            transformer.remove();
            exportLayer.remove();
          },
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public toJSON(): string {
    return JSON.stringify(this.mainLayer.toObject());
  }

  public fromJSON(json: string): void {
    this.clear();
    this.mainLayer.remove();
    const layer = Konva.Node.create(json, 'layer');
    this.mainLayer = layer;
    this.stage.add(this.mainLayer);
    this.render();
  }

  public use(plugin: Plugin, ...options: any[]): App {
    if (!this.installedPlugins.has(plugin.name)) {
      this.installedPlugins.set(plugin.name, plugin);
      plugin.install(this, ...options);
    }
    return this;
  }

  public getPlugin<T extends Plugin>(pluginName: string): T | undefined {
    return this.installedPlugins.get(pluginName) as T;
  }

  public getPlugins<T extends Plugin[]>(pluginNames: string[]): T | undefined {
    return pluginNames.map((pluginName) => this.getPlugin(pluginName)) as T;
  }

  public enablePlugin(plugins: string | string[]): App {
    if (!Array.isArray(plugins)) {
      plugins = [plugins];
    }
    const aboutToChangePlugins = this.getPlugins(plugins);
    aboutToChangePlugins?.forEach((plugin) => plugin?.enable?.());
    return this;
  }

  public disablePlugin(plugins: string | string[]): App {
    if (!Array.isArray(plugins)) {
      plugins = [plugins];
    }
    const aboutToChangePlugins = this.getPlugins(plugins);
    aboutToChangePlugins?.forEach((plugin) => plugin?.disable?.());
    return this;
  }

  public isPluginEnable(pluginName: string): boolean {
    return this.getPlugin(pluginName)?.isEnabled?.() ?? false;
  }

  public destroyPlugins(plugins: string | string[]): App {
    if (!Array.isArray(plugins)) {
      plugins = [plugins];
    }
    const aboutToChangePlugins = this.getPlugins(plugins);
    aboutToChangePlugins?.forEach((plugin) => plugin?.destroy());
    return this;
  }

  public destroy(): void {
    this.resizeObserver.disconnect();
    this.destroyPlugins(Array.from(this.installedPlugins.keys()));
    this.mouse.destroy();
    this.tooler.destroy();
    this.stage.destroy();
    this.removeAllListeners();
  }
}

export default App;
