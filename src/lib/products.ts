import all from '../../data/products.json';

export type Product = {
  id: string; platform: string; name: string; url: string; image: string;
  price: number; commissionRate: number; inStock: boolean; checkedAt: string;
  pros?: string[]; cons?: string[];
};

const byId = new Map((all as Product[]).map((p) => [p.id, p]));
export const getProduct = (id: string) => byId.get(id);
