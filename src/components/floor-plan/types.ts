export type User = {
  id: number;
  name: string;
  status: string;
  avatar: string;
  activity: string;
};

export type Space = {
  id: string;
  name: string;
  type: string;
  status: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  capacity: number;
  features: string[];
  users: User[];
};
