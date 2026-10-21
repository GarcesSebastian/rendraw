import { Render } from "../../Render";
import { Rect } from "../_shapes/Rect";
import { Circle } from "../_shapes/Circle";
import { Shape } from "../Shape";
import { Vector } from "../common/Vector";
import { Text } from "../_shapes/Text";
import { Image } from "../_shapes/Image";
import { Transformer } from "../common/Transformer";

/**
 * Interface representing the snap points for different sides of a shape.
 * Each side contains a value (position coordinate) and the complementary side to align with.
 */
export interface SnapSides {
    left: { value: number; side: "right" | "left" };
    right: { value: number; side: "left" | "right" };
    top: { value: number; side: "bottom" | "top" };
    bottom: { value: number; side: "top" | "bottom" };
    centerX: { value: number; side: "centerX" };
    centerY: { value: number; side: "centerY" };
}

/**
 * Interface representing the configuration for the snap smart system.
 */
export interface ISnapSmart {
    color?: string;
    colorViewport?: string;
    lineWidth?: number;
    lineDash?: number[];
    snapFactor?: number;
    snapTolerance?: number;
    snapDistance?: number;
    enableSpacingPatterns?: boolean;
    spacingTolerance?: number;
}

/**
 * Interface representing a vertical guide line for snapping.
 * Contains x position and the y-range (y1 to y2) for rendering.
 */
interface GuideLineX {
    x: number;
    y1: number;
    y2: number;
    isViewport: boolean;
    isSpacing?: boolean;
}

/**
 * Interface representing a horizontal guide line for snapping.
 * Contains y position and the x-range (x1 to x2) for rendering.
 */
interface GuideLineY {
    y: number;
    x1: number;
    x2: number;
    isViewport: boolean;
    isSpacing?: boolean;
}

/**
 * Interface representing spacing pattern information for debugging
 */
interface SpacingPattern {
    shapes: Shape[];
    spacing: number;
    direction: 'horizontal' | 'vertical';
    suggestedPosition: number;
    confidence: number;
}

/**
 * Smart shape alignment system that helps align shapes with each other or with the viewport.
 * Provides visual guides, automatic snapping, same-side alignment, and spacing pattern detection.
 *
 * @example
 * ```ts
 * const snap = new SnapSmart(render);
 * snap.bind(myShape);
 * snap.update();
 * snap.drawGuides();
 * ```
 */
export class SnapSmart {
    private _render: Render;
    public color: string = "#00ff00";
    public colorViewport: string = "#00ffff";
    public lineWidth: number = 2;
    public lineDash: number[] = [5, 5];
    
    private _target: Shape | Transformer | null = null;
    private _sides: SnapSides | null = null;
    private _bestX: { diff: number, side: "left" | "right" | "centerX", type: "opposite" | "same" | "spacing" } | null = null;
    private _bestY: { diff: number, side: "top" | "bottom" | "centerY", type: "opposite" | "same" | "spacing" } | null = null;
    private _isDebug: boolean = false;
    private _snapTolerance: number;
    private _snapFactor: number;
    private _snapDistance: number;
    private _enableSpacingPatterns: boolean = true;
    private _spacingTolerance: number = 5;

    private _candidatesX: { diff: number, side: "left" | "right" | "centerX", type: "opposite" | "same" | "spacing", shape?: Shape }[] = [];
    private _candidatesY: { diff: number, side: "top" | "bottom" | "centerY", type: "opposite" | "same" | "spacing", shape?: Shape }[] = [];
    private _spacingPatterns: SpacingPattern[] = [];
    private _guideLinesX: GuideLineX[] = [];
    private _guideLinesY: GuideLineY[] = [];

    /**
     * Creates a new SnapSmart instance.
     * @param render - The main Render context.
     */
    public constructor(render: Render) {
        this._render = render;

        this._render.on("mouseup", () => {
            if (this._target) {
                this._position.x += this._bestX?.diff ?? 0;
                this._position.y += this._bestY?.diff ?? 0;
            }
            this.clearGuides();
        });

        this._render.resize();
        this._snapTolerance = 15;
        this._snapFactor = 0.005;
        this._snapDistance = this._render.toWorldCoordinates(new Vector(0, 0))
            .sub(this._render.toWorldCoordinates(
                new Vector(
                    this._render.cssWidth,
                    this._render.cssHeight
                )
            )).len();

        console.log(this._spacingPatterns);
    }

    /**
     * Retrieves the current position of the target shape or transformer.
     * @returns The position as a Vector.
     */
    private get _position(): Vector {
        let position: Vector = new Vector(0, 0);
        if (!this._target) return position;

        if (this._target instanceof Shape) {
            position = this._target.position;
        }

        if (this._target instanceof Transformer) {
            position = this._target.position;
        }

        if (this._target instanceof Image) {
            position = this._target.position;
        }

        return position;
    }

    /**
     * Updates the snapping system.
     * Calculates snap points, applies snapping forces, and updates guide lines.
     * Should be called on each animation frame when active.
     */
    public update(): void {
        if (!this._target) return;
        this._sides = this.getSides(this._target);
        
        this.clearGuides();
        this._spacingPatterns = [];

        const childs = this._render.childs.filter((child: Shape) => child !== this._target && child.visible);
        const closestChild = childs.filter((child: Shape) => {
            const distance = this._target!.position.sub(child.position).len();
            return distance < this._snapDistance;
        });

        closestChild.forEach((child: Shape) => {
            if (!this._sides) return;
            const sidesChild = this.getSides(child);
          
            Object.entries(sidesChild).forEach(([side, value]) => {
                this.processSnapCandidate(side, value, child);
            });
        });

        this.processViewportSnap();
        
        if (this._enableSpacingPatterns) {
            this.detectSpacingPatterns(closestChild);
        }

        this.applyBestSnap();
        this.clearCandidates();
    }

    /**
     * Processes individual snap candidates for both opposite and same-side alignment
     */
    private processSnapCandidate(side: string, value: { value: number; side: string }, child: Shape): void {
        if (!this._sides) return;

        const targetSides = {
            left: this._sides.left.value,
            right: this._sides.right.value,
            top: this._sides.top.value,
            bottom: this._sides.bottom.value,
            centerX: this._sides.centerX.value,
            centerY: this._sides.centerY.value
        };

        if (["left", "right", "centerX"].includes(side)) {
            this.processHorizontalSnap(side, value.value, targetSides, child);
        }

        if (["top", "bottom", "centerY"].includes(side)) {
            this.processVerticalSnap(side, value.value, targetSides, child);
        }
    }

    /**
     * Processes horizontal snap candidates (left, right, centerX)
     */
    private processHorizontalSnap(side: string, childValue: number, targetSides: any, child: Shape): void {
        if (side === "left") {
            const oppositeSnap = childValue - targetSides.right;
            const sameSnap = childValue - targetSides.left;
            
            if (Math.abs(oppositeSnap) < this._snapTolerance && oppositeSnap > 0) {
                this._candidatesX.push({ diff: oppositeSnap, side: "left", type: "opposite", shape: child });
                this.addGuideLineX(childValue);
            }
            
            if (Math.abs(sameSnap) < this._snapTolerance) {
                this._candidatesX.push({ diff: sameSnap, side: "left", type: "same", shape: child });
                this.addGuideLineX(childValue);
            }
        }
        
        if (side === "right") {
            const oppositeSnap = childValue - targetSides.left;
            const sameSnap = childValue - targetSides.right;
            
            if (Math.abs(oppositeSnap) < this._snapTolerance && oppositeSnap < 0) {
                this._candidatesX.push({ diff: oppositeSnap, side: "right", type: "opposite", shape: child });
                this.addGuideLineX(childValue);
            }
            
            if (Math.abs(sameSnap) < this._snapTolerance) {
                this._candidatesX.push({ diff: sameSnap, side: "right", type: "same", shape: child });
                this.addGuideLineX(childValue);
            }
        }
        
        if (side === "centerX") {
            const centerSnap = childValue - targetSides.centerX;
            
            if (Math.abs(centerSnap) < this._snapTolerance) {
                this._candidatesX.push({ diff: centerSnap, side: "centerX", type: "same", shape: child });
                this.addGuideLineX(childValue);
            }
        }
    }

    /**
     * Processes vertical snap candidates (top, bottom, centerY)
     */
    private processVerticalSnap(side: string, childValue: number, targetSides: any, child: Shape): void {
        if (side === "top") {
            const oppositeSnap = childValue - targetSides.bottom;
            const sameSnap = childValue - targetSides.top;
            
            if (Math.abs(oppositeSnap) < this._snapTolerance && oppositeSnap > 0) {
                this._candidatesY.push({ diff: oppositeSnap, side: "top", type: "opposite", shape: child });
                this.addGuideLineY(childValue);
            }
            
            if (Math.abs(sameSnap) < this._snapTolerance) {
                this._candidatesY.push({ diff: sameSnap, side: "top", type: "same", shape: child });
                this.addGuideLineY(childValue);
            }
        }
        
        if (side === "bottom") {
            const oppositeSnap = childValue - targetSides.top;
            const sameSnap = childValue - targetSides.bottom;
            
            if (Math.abs(oppositeSnap) < this._snapTolerance && oppositeSnap < 0) {
                this._candidatesY.push({ diff: oppositeSnap, side: "bottom", type: "opposite", shape: child });
                this.addGuideLineY(childValue);
            }
            
            if (Math.abs(sameSnap) < this._snapTolerance) {
                this._candidatesY.push({ diff: sameSnap, side: "bottom", type: "same", shape: child });
                this.addGuideLineY(childValue);
            }
        }
        
        if (side === "centerY") {
            const centerSnap = childValue - targetSides.centerY;
            
            if (Math.abs(centerSnap) < this._snapTolerance) {
                this._candidatesY.push({ diff: centerSnap, side: "centerY", type: "same", shape: child });
                this.addGuideLineY(childValue);
            }
        }
    }

    /**
     * Processes viewport snapping for center alignment
     */
    private processViewportSnap(): void {
        if (!this._sides) return;

        const { left, top } = this._render.canvas.getBoundingClientRect();
        const viewportCenter = this._render.toWorldCoordinates(new Vector(this._render.cssWidth / 2, this._render.cssHeight / 2));
        const offset = this._render.getOffset();
        viewportCenter.x += offset.x;
        viewportCenter.y += offset.y;
        
        const centerXDiff = left + viewportCenter.x - this._sides["centerX"].value;
        const centerYDiff = top + viewportCenter.y - this._sides["centerY"].value;
        
        if (Math.abs(centerXDiff) < this._snapTolerance) {
            this._candidatesX.push({ diff: centerXDiff, side: "centerX", type: "same" });
            this.addGuideLineX(left + viewportCenter.x, true);
        }
        
        if (Math.abs(centerYDiff) < this._snapTolerance) {
            this._candidatesY.push({ diff: centerYDiff, side: "centerY", type: "same" });
            this.addGuideLineY(top + viewportCenter.y, true);
        }
    }

    /**
     * Detects spacing patterns between shapes and suggests consistent spacing
     */
    private detectSpacingPatterns(shapes: Shape[]): void {
        if (!this._target || shapes.length < 2) return;

        this.detectHorizontalSpacing(shapes);
        this.detectVerticalSpacing(shapes);
    }

    /**
     * Detects horizontal spacing patterns
     */
    private detectHorizontalSpacing(shapes: Shape[]): void {
        if (!this._target || !this._sides) return;

        const sortedByX = shapes.sort((a, b) => a.position.x - b.position.x);
        const spacings: number[] = [];
        
        for (let i = 0; i < sortedByX.length - 1; i++) {
            const current = this.getSides(sortedByX[i]!);
            const next = this.getSides(sortedByX[i + 1]!);
            const spacing = next.left.value - current.right.value;
            spacings.push(spacing);
        }

        if (spacings.length > 0) {
            const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
            const consistency = this.calculateSpacingConsistency(spacings);
            
            if (consistency > 0.8) {
                this.suggestSpacingPosition(sortedByX, avgSpacing, 'horizontal');
            }
        }
    }

    /**
     * Detects vertical spacing patterns
     */
    private detectVerticalSpacing(shapes: Shape[]): void {
        if (!this._target || !this._sides) return;

        const sortedByY = shapes.sort((a, b) => a.position.y - b.position.y);
        const spacings: number[] = [];
        
        for (let i = 0; i < sortedByY.length - 1; i++) {
            const current = this.getSides(sortedByY[i]!);
            const next = this.getSides(sortedByY[i + 1]!);
            const spacing = next.top.value - current.bottom.value;
            spacings.push(spacing);
        }

        if (spacings.length > 0) {
            const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
            const consistency = this.calculateSpacingConsistency(spacings);
            
            if (consistency > 0.8) {
                this.suggestSpacingPosition(sortedByY, avgSpacing, 'vertical');
            }
        }
    }

    /**
     * Calculates how consistent spacing is between shapes (0-1, 1 being perfectly consistent)
     */
    private calculateSpacingConsistency(spacings: number[]): number {
        if (spacings.length === 0) return 0;
        
        const avg = spacings.reduce((a, b) => a + b, 0) / spacings.length;
        const variance = spacings.reduce((acc, spacing) => acc + Math.pow(spacing - avg, 2), 0) / spacings.length;
        const stdDev = Math.sqrt(variance);
        
        return Math.max(0, 1 - (stdDev / Math.max(avg, 1)));
    }

    /**
     * Suggests positioning based on detected spacing patterns
     */
    private suggestSpacingPosition(shapes: Shape[], spacing: number, direction: 'horizontal' | 'vertical'): void {
        if (!this._target || !this._sides) return;

        const targetPosition = this._target.position;
        
        shapes.forEach(shape => {
            const shapeSides = this.getSides(shape);
            let suggestedPosition: number;
            let diff: number;

            if (direction === 'horizontal') {
                if (targetPosition.x < shape.position.x) {
                    suggestedPosition = shapeSides.left.value - spacing - (this._sides!.right.value - this._sides!.left.value);
                    diff = suggestedPosition - this._sides!.left.value;
                } else {
                    suggestedPosition = shapeSides.right.value + spacing;
                    diff = suggestedPosition - this._sides!.left.value;
                }
                
                if (Math.abs(diff) < this._spacingTolerance) {
                    this._candidatesX.push({ diff, side: "left", type: "spacing", shape });
                    this.addGuideLineX(suggestedPosition, false, true);
                }
            } else {
                if (targetPosition.y < shape.position.y) {
                    suggestedPosition = shapeSides.top.value - spacing - (this._sides!.bottom.value - this._sides!.top.value);
                    diff = suggestedPosition - this._sides!.top.value;
                } else {
                    suggestedPosition = shapeSides.bottom.value + spacing;
                    diff = suggestedPosition - this._sides!.top.value;
                }
                
                if (Math.abs(diff) < this._spacingTolerance) {
                    this._candidatesY.push({ diff, side: "top", type: "spacing", shape });
                    this.addGuideLineY(suggestedPosition, false, true);
                }
            }
        });
    }

    /**
     * Applies the best snap candidate with priority system
     */
    private applyBestSnap(): void {
        if (this._candidatesX.length > 0) {
            const bestX = this.getBestCandidate(this._candidatesX);
            this._bestX = bestX;
            this._target!.position.x += bestX.diff * this._snapFactor;
        }

        if (this._candidatesY.length > 0) {
            const bestY = this.getBestCandidate(this._candidatesY);
            this._bestY = bestY;
            this._target!.position.y += bestY.diff * this._snapFactor;
        }
    }

    /**
     * Gets the best candidate with priority: spacing > same > opposite
     */
    private getBestCandidate<T extends { diff: number; type: string }>(candidates: T[]): T {
        const priority = { spacing: 3, same: 2, opposite: 1 };
        
        return candidates.reduce((best, current) => {
            const bestPriority = priority[best.type as keyof typeof priority] || 0;
            const currentPriority = priority[current.type as keyof typeof priority] || 0;
            
            if (currentPriority > bestPriority) return current;
            if (currentPriority === bestPriority && Math.abs(current.diff) < Math.abs(best.diff)) return current;
            
            return best;
        });
    }

    /**
     * Clears candidate arrays
     */
    private clearCandidates(): void {
        this._candidatesX = [];
        this._candidatesY = [];
    }

    /**
     * Binds a shape to the snapping system.
     * The bound shape becomes the target for alignment with other shapes.
     * 
     * @param instance - The shape to bind for snapping.
     */
    public bind(instance: Shape | Transformer): void {
        this._target = instance;
        this.sides();
    }

    /**
     * Unbinds the current target shape and clears guide lines.
     * Disables the snapping system until a new shape is bound.
     */
    public unbind(): void {
        this._target = null;
        this._sides = null;
        this.clearGuides();
    }

    /**
     * Toggles debug mode, which shows snap points and guide lines.
     * @param isDebug - Whether to enable or disable debug mode.
     */
    public debug(isDebug: boolean): void {
        this._isDebug = isDebug;
    }

    /**
     * Updates the cached sides information for the target shape.
     * Called automatically when binding a shape or when shapes change.
     */
    public sides(): void {
        if (!this._target) return;
        this._sides = this.getSides(this._target);
    }

    /**
     * Calculates snap sides for any shape instance with support for all shape types
     */
    public getSides(instance: Shape | Transformer): SnapSides {
        let width = 0;
        let height = 0;
        let left = instance.position.x;
        let top = instance.position.y;

        if (instance instanceof Rect) {
            width = instance.width;
            height = instance.height;
            left = instance.position.x;
            top = instance.position.y;
        }

        if (instance instanceof Image) {
            width = instance.width;
            height = instance.height;
            left = instance.position.x;
            top = instance.position.y;
        }

        if (instance instanceof Transformer) {
            width = instance.width;
            height = instance.height;
            left = instance.position.x;
            top = instance.position.y;
        }

        if (instance instanceof Circle) {
            width = instance.radius * 2;
            height = instance.radius * 2;
            left = instance.position.x - instance.radius;
            top = instance.position.y - instance.radius;
        }

        if (instance instanceof Text) {
            width = instance.width + instance.padding.left + instance.padding.right + instance.borderWidth;
            height = instance.height + instance.padding.top + instance.padding.bottom + instance.borderWidth;
            left = instance.position.x - instance.padding.left - instance.borderWidth / 2;
            top = instance.position.y - instance.ascent - instance.padding.top - instance.borderWidth / 2;
        }

        return {
            left: { value: left, side: "right" },
            right: { value: left + width, side: "left" },
            top: { value: top, side: "bottom" },
            bottom: { value: top + height, side: "top" },
            centerX: { value: left + width / 2, side: "centerX" },
            centerY: { value: top + height / 2, side: "centerY" },
        };
    }

    /**
     * Enhanced debug visualization with comprehensive information display
     */
    public drawDebugPoints(): void {
        if (!this._target || !this._isDebug) return;
        
        const sides = this.getSides(this._target);
        const offset = this._render.getOffset();
        const zoom = this._render.zoom;
        
        this._render.ctx.save();
        
        this.drawTargetSnapPoints(sides, offset, zoom);
        this.drawSnapConnections(sides, offset, zoom);
        this.drawNearbyShapesDebug(offset, zoom);
        this.drawViewportCenter(offset, zoom);
        
        this._render.ctx.restore();
    }

    /**
     * Draws enhanced snap points for the target shape
     */
    private drawTargetSnapPoints(sides: SnapSides, offset: Vector, zoom: number): void {
        const baseRadius = 4 / zoom;
        const pulseRadius = baseRadius + (Math.sin(Date.now() * 0.008) * 2) / zoom;
        
        this._render.ctx.shadowColor = '#00ff88';
        this._render.ctx.shadowBlur = 15 / zoom;
        
        this._render.ctx.fillStyle = '#00ff88';
        this.drawEnhancedPoint(sides.left.value - offset.x, sides.top.value - offset.y, pulseRadius, 'TL');
        this.drawEnhancedPoint(sides.right.value - offset.x, sides.top.value - offset.y, pulseRadius, 'TR');
        this.drawEnhancedPoint(sides.left.value - offset.x, sides.bottom.value - offset.y, pulseRadius, 'BL');
        this.drawEnhancedPoint(sides.right.value - offset.x, sides.bottom.value - offset.y, pulseRadius, 'BR');
        
        this._render.ctx.fillStyle = '#4488ff';
        this._render.ctx.shadowColor = '#4488ff';
        this.drawEnhancedPoint(sides.left.value - offset.x, sides.centerY.value - offset.y, pulseRadius, 'L');
        this.drawEnhancedPoint(sides.right.value - offset.x, sides.centerY.value - offset.y, pulseRadius, 'R');
        this.drawEnhancedPoint(sides.centerX.value - offset.x, sides.top.value - offset.y, pulseRadius, 'T');
        this.drawEnhancedPoint(sides.centerX.value - offset.x, sides.bottom.value - offset.y, pulseRadius, 'B');
        
        this._render.ctx.fillStyle = '#ffdd00';
        this._render.ctx.shadowColor = '#ffdd00';
        this._render.ctx.shadowBlur = 20 / zoom;
        this.drawEnhancedPoint(sides.centerX.value - offset.x, sides.centerY.value - offset.y, pulseRadius * 1.5, 'C');
        
        this._render.ctx.shadowBlur = 0;
    }

    /**
     * Draws enhanced point markers with labels
     */
    private drawEnhancedPoint(x: number, y: number, radius: number, label: string): void {
        const zoom = this._render.zoom;
        
        this._render.ctx.beginPath();
        this._render.ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
        this._render.ctx.globalAlpha = 0.3;
        this._render.ctx.fill();
        this._render.ctx.globalAlpha = 1;
        
        this._render.ctx.beginPath();
        this._render.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this._render.ctx.fill();
        
        this._render.ctx.fillStyle = '#ffffff';
        this._render.ctx.beginPath();
        this._render.ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
        this._render.ctx.fill();
        
        this._render.ctx.fillStyle = '#ffffff';
        this._render.ctx.font = `${12 / zoom}px monospace`;
        this._render.ctx.textAlign = 'center';
        this._render.ctx.textBaseline = 'middle';
        this._render.ctx.fillText(label, x, y - (radius * 2.5));
    }

    /**
     * Draws connection lines showing active snaps with type indicators
     */
    private drawSnapConnections(sides: SnapSides, offset: Vector, zoom: number): void {
        if (!this._bestX && !this._bestY) return;
        
        const centerX = sides.centerX.value - offset.x;
        const centerY = sides.centerY.value - offset.y;
        
        this._render.ctx.setLineDash([8 / zoom, 4 / zoom]);
        this._render.ctx.lineDashOffset = -(Date.now() * 0.01) % (12 / zoom);
        this._render.ctx.lineWidth = 3 / zoom;
        
        if (this._bestX) {
            const colors = { same: '#ff6b35', opposite: '#35b5ff', spacing: '#b535ff' };
            this._render.ctx.strokeStyle = colors[this._bestX.type] || '#ff6b35';
            this._render.ctx.shadowColor = colors[this._bestX.type] || '#ff6b35';
            this._render.ctx.shadowBlur = 10 / zoom;
            
            const targetX = sides[this._bestX.side as keyof SnapSides].value - offset.x;
            this.drawSnapTypeIndicator(targetX + this._bestX.diff / 2, centerY - 20 / zoom, this._bestX.type, zoom);
        }
        
        if (this._bestY) {
            const colors = { same: '#ff35b5', opposite: '#35ffb5', spacing: '#ffb535' };
            this._render.ctx.strokeStyle = colors[this._bestY.type] || '#ff35b5';
            this._render.ctx.shadowColor = colors[this._bestY.type] || '#ff35b5';
            this._render.ctx.shadowBlur = 10 / zoom;
            
            const targetY = sides[this._bestY.side as keyof SnapSides].value - offset.y;
            this.drawSnapTypeIndicator(centerX + 20 / zoom, targetY + this._bestY.diff / 2, this._bestY.type, zoom);
        }
        
        this._render.ctx.shadowBlur = 0;
        this._render.ctx.setLineDash([]);
    }

    /**
     * Draws snap type indicators (same, opposite, spacing)
     */
    private drawSnapTypeIndicator(x: number, y: number, type: string, zoom: number): void {
        const size = 16 / zoom;
        const icons = {
            same: '=',
            opposite: '⟷',
            spacing: '⋯'
        };
        
        this._render.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this._render.ctx.fillRect(x - size/2, y - size/2, size, size);
        
        this._render.ctx.fillStyle = '#ffffff';
        this._render.ctx.font = `${10 / zoom}px monospace`;
        this._render.ctx.textAlign = 'center';
        this._render.ctx.textBaseline = 'middle';
        this._render.ctx.fillText(icons[type as keyof typeof icons] || '?', x, y);
    }

    /**
     * Visualizes nearby shapes with enhanced snap zone indicators
     */
    private drawNearbyShapesDebug(offset: Vector, zoom: number): void {
        if (!this._target) return;
        
        const childs = this._render.childs.filter((child: Shape) => 
            child !== this._target && child.visible
        );
        
        childs.forEach((child: Shape) => {
            const distance = this._target!.position.sub(child.position).len();
            const isClose = distance < this._snapDistance;
            
            if (isClose) {
                const childSides = this.getSides(child);
                const alpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
                this._render.ctx.globalAlpha = alpha;
                this._render.ctx.strokeStyle = '#00ffff';
                this._render.ctx.lineWidth = 2 / zoom;
                this._render.ctx.setLineDash([4 / zoom, 2 / zoom]);
                
                this._render.ctx.beginPath();
                this._render.ctx.rect(
                    childSides.left.value - offset.x - 5 / zoom,
                    childSides.top.value - offset.y - 5 / zoom,
                    (childSides.right.value - childSides.left.value) + 10 / zoom,
                    (childSides.bottom.value - childSides.top.value) + 10 / zoom
                );
                this._render.ctx.stroke();
                
                this.drawSnapZones(childSides, offset, zoom);
                this.drawSameSideIndicators(childSides, offset, zoom);
                
                this._render.ctx.globalAlpha = 1;
                this._render.ctx.setLineDash([]);
            }
        });
    }

    /**
     * Draws snap zones around shapes for both opposite and same-side snapping
     */
    private drawSnapZones(sides: SnapSides, offset: Vector, zoom: number): void {
        const tolerance = this._snapTolerance;
        
        this._render.ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        this._render.ctx.lineWidth = 1 / zoom;
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.left.value - offset.x - tolerance,
            sides.top.value - offset.y - tolerance,
            tolerance * 2,
            (sides.bottom.value - sides.top.value) + tolerance * 2
        );
        this._render.ctx.stroke();
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.right.value - offset.x - tolerance,
            sides.top.value - offset.y - tolerance,
            tolerance * 2,
            (sides.bottom.value - sides.top.value) + tolerance * 2
        );
        this._render.ctx.stroke();
        
        this._render.ctx.strokeStyle = 'rgba(255, 165, 0, 0.6)';
        this._render.ctx.setLineDash([2 / zoom, 2 / zoom]);
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.left.value - offset.x - tolerance,
            sides.top.value - offset.y - tolerance,
            tolerance * 2,
            (sides.bottom.value - sides.top.value) + tolerance * 2
        );
        this._render.ctx.stroke();
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.right.value - offset.x - tolerance,
            sides.top.value - offset.y - tolerance,
            tolerance * 2,
            (sides.bottom.value - sides.top.value) + tolerance * 2
        );
        this._render.ctx.stroke();
        
        this._render.ctx.setLineDash([]);
    }

    /**
     * Draws indicators for same-side snap points
     */
    private drawSameSideIndicators(sides: SnapSides, offset: Vector, zoom: number): void {
        const indicatorSize = 6 / zoom;
        
        this._render.ctx.fillStyle = '#ff9500';
        this._render.ctx.shadowColor = '#ff9500';
        this._render.ctx.shadowBlur = 8 / zoom;
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.left.value - offset.x - indicatorSize/2,
            sides.centerY.value - offset.y - indicatorSize/2,
            indicatorSize,
            indicatorSize
        );
        this._render.ctx.fill();
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.right.value - offset.x - indicatorSize/2,
            sides.centerY.value - offset.y - indicatorSize/2,
            indicatorSize,
            indicatorSize
        );
        this._render.ctx.fill();
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.centerX.value - offset.x - indicatorSize/2,
            sides.top.value - offset.y - indicatorSize/2,
            indicatorSize,
            indicatorSize
        );
        this._render.ctx.fill();
        
        this._render.ctx.beginPath();
        this._render.ctx.rect(
            sides.centerX.value - offset.x - indicatorSize/2,
            sides.bottom.value - offset.y - indicatorSize/2,
            indicatorSize,
            indicatorSize
        );
        this._render.ctx.fill();
        
        this._render.ctx.shadowBlur = 0;
    }

    /**
     * Draws viewport center crosshair indicator
     */
    private drawViewportCenter(offset: Vector, zoom: number): void {
        const viewportCenter = this._render.toWorldCoordinates(
            new Vector(this._render.cssWidth / 2, this._render.cssHeight / 2)
        );
        const renderOffset = this._render.getOffset();
        viewportCenter.x += renderOffset.x;
        viewportCenter.y += renderOffset.y;
        
        const centerX = viewportCenter.x - offset.x;
        const centerY = viewportCenter.y - offset.y;
        
        this._render.ctx.strokeStyle = '#00ffff';
        this._render.ctx.lineWidth = 2 / zoom;
        this._render.ctx.setLineDash([6 / zoom, 3 / zoom]);
        this._render.ctx.lineDashOffset = -(Date.now() * 0.005) % (9 / zoom);
        
        const crossSize = 20 / zoom;
        
        this._render.ctx.beginPath();
        this._render.ctx.moveTo(centerX - crossSize, centerY);
        this._render.ctx.lineTo(centerX + crossSize, centerY);
        this._render.ctx.stroke();
        
        this._render.ctx.beginPath();
        this._render.ctx.moveTo(centerX, centerY - crossSize);
        this._render.ctx.lineTo(centerX, centerY + crossSize);
        this._render.ctx.stroke();
        
        this._render.ctx.fillStyle = '#00ffff';
        this._render.ctx.beginPath();
        this._render.ctx.arc(centerX, centerY, 3 / zoom, 0, Math.PI * 2);
        this._render.ctx.fill();
        
        this._render.ctx.setLineDash([]);
    }

    /**
     * Adds a vertical guide line at the specified x-coordinate.
     * Guide line will span the entire visible height of the canvas.
     * 
     * @param x - The x-coordinate for the vertical guide line.
     * @param isViewport - Whether this is a viewport guide line.
     * @param isSpacing - Whether this guide represents spacing pattern.
     */
    private addGuideLineX(x: number, isViewport: boolean = false, isSpacing: boolean = false): void {
        const offset = this._render.getOffset();
        const topLeft = this._render.toWorldCoordinates(Vector.zero).add(offset);
        const bottomRight = this._render.toWorldCoordinates(new Vector(this._render.cssWidth, this._render.cssHeight)).add(offset);

        const y1 = topLeft.y;
        const y2 = bottomRight.y;
        
        this._guideLinesX.push({ x, y1, y2, isViewport, isSpacing });
    }

    /**
     * Adds a horizontal guide line at the specified y-coordinate.
     * Guide line will span the entire visible width of the canvas.
     * 
     * @param y - The y-coordinate for the horizontal guide line.
     * @param isViewport - Whether this is a viewport guide line.
     * @param isSpacing - Whether this guide represents spacing pattern.
     */
    private addGuideLineY(y: number, isViewport: boolean = false, isSpacing: boolean = false): void {
        const offset = this._render.getOffset();
        const topLeft = this._render.toWorldCoordinates(Vector.zero).add(offset);
        const bottomRight = this._render.toWorldCoordinates(new Vector(this._render.cssWidth, this._render.cssHeight)).add(offset);
        
        const x1 = topLeft.x;
        const x2 = bottomRight.x;
        
        this._guideLinesY.push({ y, x1, x2, isViewport, isSpacing });
    }

    /**
     * Clears all guide lines from the snap system.
     */
    private clearGuides(): void {
        this._guideLinesX = [];
        this._guideLinesY = [];
    }

    /**
     * Sets the configuration for the snap smart system.
     * @param DataSnapSmart - The configuration object.
     */
    public setConfig(DataSnapSmart: ISnapSmart): void {
        this.color = DataSnapSmart.color ?? this.color;
        this.colorViewport = DataSnapSmart.colorViewport ?? this.colorViewport;
        this.lineWidth = DataSnapSmart.lineWidth ?? this.lineWidth;
        this.lineDash = DataSnapSmart.lineDash ?? this.lineDash;
        this._snapFactor = DataSnapSmart.snapFactor ?? this._snapFactor;
        this._snapTolerance = DataSnapSmart.snapTolerance ?? this._snapTolerance;
        this._snapDistance = DataSnapSmart.snapDistance ?? this._snapDistance;
        this._enableSpacingPatterns = DataSnapSmart.enableSpacingPatterns ?? this._enableSpacingPatterns;
        this._spacingTolerance = DataSnapSmart.spacingTolerance ?? this._spacingTolerance;
    }

    /**
     * Gets the target shape for snapping.
     * @returns The target shape or null if no target is set.
     */
    public getTarget(): Shape | Transformer | null {
        return this._target;
    }

    /**
     * Renders all active guide lines with enhanced styling for different types
     */
    public drawGuides(): void {
        if (!this._target) return;
        
        this._render.ctx.save();
        const offset = this._render.getOffset();

        this._guideLinesX.forEach(guide => {
            this._render.ctx.lineWidth = this.lineWidth / this._render.zoom;
            
            if (guide.isViewport) {
                this._render.ctx.strokeStyle = this.colorViewport;
                this._render.ctx.setLineDash(this.lineDash);
            } else if (guide.isSpacing) {
                this._render.ctx.strokeStyle = '#b535ff';
                this._render.ctx.setLineDash([12 / this._render.zoom, 6 / this._render.zoom]);
            } else {
                this._render.ctx.strokeStyle = this.color;
                this._render.ctx.setLineDash(this.lineDash);
            }
            
            this._render.ctx.beginPath();
            this._render.ctx.moveTo(guide.x - offset.x, guide.y1 - offset.y);
            this._render.ctx.lineTo(guide.x - offset.x, guide.y2 - offset.y);
            this._render.ctx.stroke();
        });
        
        this._guideLinesY.forEach(guide => {
            this._render.ctx.lineWidth = this.lineWidth / this._render.zoom;
            
            if (guide.isViewport) {
                this._render.ctx.strokeStyle = this.colorViewport;
                this._render.ctx.setLineDash(this.lineDash);
            } else if (guide.isSpacing) {
                this._render.ctx.strokeStyle = '#b535ff';
                this._render.ctx.setLineDash([12 / this._render.zoom, 6 / this._render.zoom]);
            } else {
                this._render.ctx.strokeStyle = this.color;
                this._render.ctx.setLineDash(this.lineDash);
            }
            
            this._render.ctx.beginPath();
            this._render.ctx.moveTo(guide.x1 - offset.x, guide.y - offset.y);
            this._render.ctx.lineTo(guide.x2 - offset.x, guide.y - offset.y);
            this._render.ctx.stroke();
        });
        
        this._render.ctx.restore();
        this.drawDebugPoints();
    }
}