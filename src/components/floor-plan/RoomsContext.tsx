import { createContext, useContext, ReactNode, useState } from 'react';
import { Room } from './types';

type RoomsContextType = {
  rooms: Room[];
  addRoom: (room: Room) => void;
  updateRoom: (roomId: string, updates: Partial<Room>) => void;
};

export const RoomsContext = createContext<RoomsContextType>({
  rooms: [],
  addRoom: () => {},
  updateRoom: () => {},
});

export const RoomsProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);

  const addRoom = (room: Room) => {
    setRooms((prev) => [...prev, room]);
  };

  const updateRoom = (roomId: string, updates: Partial<Room>) => {
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId ? { ...room, ...updates } : room
      )
    );
  };

  return (
    <RoomsContext.Provider value={{ rooms, addRoom, updateRoom }}>
      {children}
    </RoomsContext.Provider>
  );
};

export const useRooms = () => useContext(RoomsContext);
