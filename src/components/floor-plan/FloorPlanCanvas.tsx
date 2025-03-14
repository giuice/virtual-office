import { Stage, Layer, Rect, Text } from 'react-konva';
import { Space } from './types';

type FloorPlanCanvasProps = {
  spaces: Space[];
  onSpaceSelect: (space: Space) => void;
};

export const FloorPlanCanvas = ({ spaces, onSpaceSelect }: FloorPlanCanvasProps) => {
  return (
    <Stage width={window.innerWidth} height={600}>
      <Layer>
        {spaces.map((space) => (
          <Rect
            key={space.id}
            x={space.position.x}
            y={space.position.y}
            width={space.position.width}
            height={space.position.height}
            fill="#f0fdf4"
            stroke="#4ade80"
            strokeWidth={2}
            onClick={() => onSpaceSelect(space)}
          />
        ))}
      </Layer>
    </Stage>
  );
};
