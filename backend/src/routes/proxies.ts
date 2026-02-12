import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';
import { authenticate, requireAdmin } from '../middleware/auth';
import { encrypt, decrypt } from '../services/encryption';

export const proxyRouter = Router();
proxyRouter.use(authenticate);
proxyRouter.use(requireAdmin);

const proxySchema = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  country: z.string().optional(),
});

proxyRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const proxies = await prisma.proxyConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const safe = proxies.map((p) => ({
      ...p,
      password: p.password ? '****' : null,
    }));
    res.json({ proxies: safe });
  } catch {
    res.status(500).json({ error: 'Failed to fetch proxies' });
  }
});

proxyRouter.post('/', async (req: Request, res: Response) => {
  try {
    const data = proxySchema.parse(req.body);
    const proxy = await prisma.proxyConfig.create({
      data: {
        ...data,
        password: data.password ? encrypt(data.password) : null,
      },
    });
    res.status(201).json({ proxy: { ...proxy, password: proxy.password ? '****' : null } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create proxy' });
  }
});

proxyRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = proxySchema.partial().parse(req.body);
    const updateData: Record<string, unknown> = { ...data };
    if (data.password) updateData.password = encrypt(data.password);

    const proxy = await prisma.proxyConfig.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ proxy: { ...proxy, password: proxy.password ? '****' : null } });
  } catch {
    res.status(500).json({ error: 'Failed to update proxy' });
  }
});

proxyRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.proxyConfig.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete proxy' });
  }
});
