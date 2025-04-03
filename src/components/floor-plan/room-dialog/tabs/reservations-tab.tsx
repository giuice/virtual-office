// src/components/floor-plan/room-dialog/tabs/reservations-tab.tsx
'use client'

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from 'lucide-react';
import { Reservation } from '@/types/database';
import { RoomReservationsTabProps } from '../types';

export function ReservationsTab({ reservations = [] }: RoomReservationsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Upcoming Reservations</h3>
        <Button variant="outline" size="sm" className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          Make Reservation
        </Button>
      </div>
      
      <ScrollArea className="h-[200px] rounded-md border p-4">
        <div className="space-y-4">
          {reservations.length > 0 ? (
            reservations.map((reservation) => {
              // Format dates nicely
              const startDate = new Date(reservation.startTime);
              const endDate = new Date(reservation.endTime);
              const formattedDate = startDate.toLocaleDateString();
              const formattedStartTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const formattedEndTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              return (
                <div key={reservation.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{formattedDate}</span>
                    </div>
                    <Badge variant="outline">
                      {formattedStartTime} - {formattedEndTime}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{reservation.userName}</p>
                    {reservation.purpose && (
                      <p className="text-sm text-muted-foreground">{reservation.purpose}</p>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
              <Calendar className="h-10 w-10 mb-2 opacity-20" />
              <p>No reservations for this room</p>
              <p className="text-sm">Schedule a meeting time</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}