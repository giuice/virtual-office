import { Group, Rect, Text } from 'react-konva';
import { Room } from './types';

type RoomComponentProps = {
  room: Room;
  onDragEnd: (updatedRoom: Room) => void;
};

export const RoomComponent = ({ room, onDragEnd }: RoomComponentProps) => {
  return (
    <Group
      draggable
      onDragEnd={(e) => {
        onDragEnd({
          ...room,
          x: e.target.x(),
          y: e.target.y(),
        });
      }}
    >
      <Rect
        x={room.x}
        y={room.y}
        width={room.width}
        height={room.height}
        fill="#f0fdf4"
        stroke="#4ade80"
        strokeWidth={2}
      />
      <Text
        x={room.x}
        y={room.y - 20}
        text={room.name}
        fontSize={16}
        fill="#14532d"
      />
    </Group>
  );
};
