import Konva from 'konva';

import { App } from '../app';
import { Rect } from '../customs/rect';
import { ChildType, EventArgs, Service } from '../types';
import { Point } from '../utils';

export class Selector extends Service {
  public selected: Map<number | string, ChildType>;
  public optionLayer: Konva.Layer;
  public enable: boolean = false;

  private transformer: Konva.Transformer;
  private rubberRect: Rect;
  private rubberStartPoint: Point = new Point(0, 0);
  private rubberEnable: boolean = false;

  constructor(app: App) {
    super(app);
    this.selected = new Map();
    this.optionLayer = new Konva.Layer();
    this.optionLayer.name('pictode:option:layer');
    this.app.stage.add(this.optionLayer);

    this.transformer = new Konva.Transformer({
      padding: 3,
      borderStroke: 'rgb(157, 157, 231)',
      borderStrokeWidth: 1,
      anchorSize: 8,
      anchorStroke: 'rgb(157, 157, 231)',
      anchorCornerRadius: 3,
      anchorStrokeWidth: 1,
      rotateAnchorOffset: 20,
    });
    this.transformer.anchorStyleFunc((anchor) => {
      const setAnchorCursor = (cursor: string = '') => {
        const anchorStage = anchor.getStage();
        if (!anchorStage || !anchorStage.content) {
          return;
        }
        anchorStage.content.style.cursor = cursor;
      };
      anchor.on('mousedown', () => {
        this.enable = false;
      });
      anchor.on('mouseup', () => {
        this.enable = true;
      });
      anchor.on('mouseenter', () => {
        this.enable = false;
        if (!anchor.hasName('rotater')) {
          return;
        }
        setAnchorCursor('grab');
      });
      anchor.on('mouseout', () => {
        this.enable = true;
        if (!anchor.hasName('rotater')) {
          return;
        }
        setAnchorCursor();
      });
    });

    this.optionLayer.add(this.transformer);

    this.rubberRect = new Rect({
      stroke: 'rgb(157, 157, 231)',
      fill: 'rgba(157, 157, 231, 0.5)',
      strokeWidth: 2,
    });
    this.optionLayer.add(this.rubberRect);

    this.transformer.on<'transformstart'>('transformstart', this.onTransformStart);
    this.transformer.on<'transformend'>('transformend', this.onTransformEnd);
    this.transformer.on<'dragstart'>('dragstart', this.onDragStart);
    this.transformer.on<'dragend'>('dragend', this.onDragEnd);

    this.app.on('mouse:down', this.onMouseDown);
    this.app.on('mouse:move', this.onMouseMove);
    this.app.on('mouse:up', this.onMouseUp);
    this.app.on('mouse:click', this.onMouseClick);
  }

  public select(...children: ChildType[]): void {
    if (!this.enable) {
      return;
    }
    this.cancelSelect();
    children.forEach((child) => {
      child.draggable(true);
      this.selected.set(child.id(), child);
    });
    this.transformer.nodes(children);
    this.app.render();
  }

  public cancelSelect(...children: ChildType[]): void {
    if (children.length === 0) {
      children = [...this.selected.values()];
    }
    const removed = children.map((child) => {
      child.draggable(false);
      return child.id();
    });
    removed.forEach((id) => this.selected.delete(id));
    this.transformer.nodes([...this.selected.values()]);
  }

  public triggerSelector(enable?: boolean): void {
    if (enable === void 0) {
      this.enable = !this.enable;
    } else {
      this.enable = enable;
    }
    if (!this.enable) {
      this.rubberEnable = false;
    }
  }

  public isSelected(child: ChildType): boolean {
    return this.selected.has(child.id());
  }

  private onTransformStart = (): void => {
    this.app.emit('shape:transform:start', { object: [...this.selected.values()] });
  };

  private onTransformEnd = (): void => {
    this.app.emit('shape:transform:end', { object: [...this.selected.values()] });
  };

  private onDragStart = (): void => {
    this.app.emit('shape:transform:start', { object: [...this.selected.values()] });
  };

  private onDragEnd = (): void => {
    this.app.emit('shape:transform:end', { object: [...this.selected.values()] });
  };

  private onMouseDown = ({ event }: EventArgs['mouse:down']): void => {
    if (!this.enable) {
      return;
    }
    if (event.target instanceof Konva.Stage) {
      this.cancelSelect();
      this.rubberStartPoint.clone(this.app.pointer);
      this.rubberRect.setPosition(this.rubberStartPoint);
      this.rubberRect.width(0);
      this.rubberRect.height(0);
      this.rubberRect.visible(false);
      this.rubberEnable = true;
    }
  };

  private onMouseMove = ({ event }: EventArgs['mouse:move']): void => {
    if (!this.enable) {
      return;
    }
    if (
      event.target instanceof Konva.Stage ||
      !this.app.isPointInArea(this.app.pointer, this.transformer.getClientRect())
    ) {
      document.body.style.cursor = 'default';
    } else {
      document.body.style.cursor = 'move';
    }
    if (!this.rubberEnable) {
      return;
    }
    const position = new Point(
      Math.min(this.app.pointer.x, this.rubberStartPoint.x),
      Math.min(this.app.pointer.y, this.rubberStartPoint.y)
    );
    const width = Math.max(this.app.pointer.x, this.rubberStartPoint.x) - position.x;
    const height = Math.max(this.app.pointer.y, this.rubberStartPoint.y) - position.y;
    this.rubberRect.setPosition(position);
    this.rubberRect.width(width);
    this.rubberRect.height(height);
    this.rubberRect.visible(true);
  };

  private onMouseUp = (): void => {
    if (!this.enable) {
      return;
    }
    if (this.rubberEnable) {
      this.select(...this.app.getShapesInArea(this.rubberRect));
    }
    this.rubberRect.visible(false);
    this.rubberEnable = false;
  };

  private onMouseClick = ({ event }: EventArgs['mouse:click']): void => {
    if (event.target instanceof Konva.Stage) {
      return;
    }
    this.select(event.target);
  };

  public dispose(): void {
    this.transformer.off('transformstart', this.onTransformStart);
    this.transformer.off('transformend', this.onTransformEnd);
    this.transformer.off('dragstart', this.onDragStart);
    this.transformer.off('dragend', this.onDragEnd);
    this.app.off('mouse:down', this.onMouseDown);
    this.app.off('mouse:move', this.onMouseMove);
    this.app.off('mouse:up', this.onMouseUp);
    this.app.off('mouse:click', this.onMouseClick);
    this.selected.clear();
    this.enable = false;
    this.transformer.destroy();
    this.optionLayer.destroy();
  }
}

export default Selector;
