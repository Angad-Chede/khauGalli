export * from './uuid';
export * from './env';
export * from './formatters';
export * from './pricing';
export * from './state-machine';

export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  RESTAURANT: 'RESTAURANT',
  RIDER: 'RIDER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export interface DemoPersona {
  role: UserRole;
  name: string;
  phone: string;
  description: string;
  targetRoute: string;
}

export const DEMO_PERSONAS: Record<string, DemoPersona> = {
  CUSTOMER: {
    role: 'CUSTOMER',
    name: 'Asha Sharma',
    phone: '+919999900001',
    description: 'Customer ordering dinner in Bengaluru',
    targetRoute: '/customer',
  },
  RESTAURANT: {
    role: 'RESTAURANT',
    name: 'Ravi Patel',
    phone: '+919999900002',
    description: 'Kitchen Lead at Khau Galli Chaat',
    targetRoute: '/restaurant',
  },
  RIDER: {
    role: 'RIDER',
    name: 'Imran Khan',
    phone: '+919999900003',
    description: 'Delivery Partner on 2-wheeler',
    targetRoute: '/rider',
  },
  ADMIN: {
    role: 'ADMIN',
    name: 'Meera Sundaram',
    phone: '+919999900004',
    description: 'Marketplace Operations & Finance Admin',
    targetRoute: '/admin',
  },
};
