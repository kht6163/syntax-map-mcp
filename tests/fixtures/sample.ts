export interface User {
  id: string;
  name: string;
}

export type UserId = User['id'];

export class UserService {
  constructor(private readonly users: User[]) {}

  findUser(id: UserId): User | undefined {
    return this.users.find(user => user.id === id);
  }
}

export function formatUser(user: User): string {
  return `${user.id}:${user.name}`;
}

const defaultUser: User = { id: '1', name: 'Ada' };

formatUser(defaultUser);
