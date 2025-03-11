import { Stage, Layer, Rect, Text } from 'react-konva';
import { Room } from './types';

type FloorPlanCanvasProps = {
  rooms: Room[];
  onRoomCreate: (room: Room) => void;
};

export const FloorPlanCanvas = ({ rooms, onRoomCreate }: FloorPlanCanvasProps) => {
  return (
    <Stage width={window.innerWidth} height={600}>
      <Layer>
        {rooms.map((room) => (
          <Rect
            key={room.id}
            x={room.x}
            y={room.y}
            width={room.width}
            height={room.height}
            fill="#f0fdf4"
            stroke="#4ade80"
            strokeWidth={2}
          />
        ))}
      </Layer>
    </Stage>
  );
};
