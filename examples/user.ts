export interface User {
  id: string;
  name: string;
  email: string;
}

export function createUser(name: string, email: string): User {
  return { id: crypto.randomUUID(), name, email };
}
