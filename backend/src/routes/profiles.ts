import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../db/client';
import { authenticate } from '../middleware/auth';
import { encrypt, decrypt } from '../services/encryption';
import { logger } from '../services/logger';

export const profileRouter = Router();
profileRouter.use(authenticate);

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    logger.error('Failed to decrypt value');
    return '***decryption-error***';
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const profileSchema = z.object({
  fullName: z.string().min(1),
  passportNumber: z.string().min(1),
  dateOfBirth: z.string().transform((s) => new Date(s)),
  passportExpiry: z.string().transform((s) => new Date(s)),
  nationality: z.string().default('Angolan'),
  email: z.string().email(),
  phone: z.string().min(1),
  priority: z.enum(['HIGH', 'NORMAL']).default('NORMAL'),
});

profileRouter.get('/', async (req: Request, res: Response) => {
  try {
    const profiles = await prisma.applicantProfile.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });

    const decrypted = profiles.map((p) => ({
      ...p,
      passportNumber: safeDecrypt(p.passportNumber),
    }));

    res.json({ profiles: decrypted });
  } catch {
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

profileRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const profile = await prisma.applicantProfile.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile: { ...profile, passportNumber: safeDecrypt(profile.passportNumber) } });
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

profileRouter.post('/', async (req: Request, res: Response) => {
  try {
    const data = profileSchema.parse(req.body);
    const profile = await prisma.applicantProfile.create({
      data: {
        ...data,
        passportNumber: encrypt(data.passportNumber),
        userId: req.user!.userId,
      },
    });
    res.status(201).json({ profile: { ...profile, passportNumber: data.passportNumber } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

profileRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.applicantProfile.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const data = profileSchema.partial().parse(req.body);
    const updateData: Record<string, unknown> = { ...data };
    if (data.passportNumber) {
      updateData.passportNumber = encrypt(data.passportNumber);
    }

    const profile = await prisma.applicantProfile.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ profile: { ...profile, passportNumber: safeDecrypt(profile.passportNumber) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

profileRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.applicantProfile.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    await prisma.applicantProfile.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

profileRouter.post('/bulk-upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    const created: string[] = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const data = profileSchema.parse({
          fullName: row['Full Name'] || row['fullName'],
          passportNumber: row['Passport Number'] || row['passportNumber'],
          dateOfBirth: row['Date of Birth'] || row['dateOfBirth'],
          passportExpiry: row['Passport Expiry'] || row['passportExpiry'],
          nationality: row['Nationality'] || row['nationality'] || 'Angolan',
          email: row['Email'] || row['email'],
          phone: row['Phone'] || row['phone'],
          priority: (row['Priority'] || row['priority'] || 'NORMAL').toUpperCase() as 'HIGH' | 'NORMAL',
        });

        const profile = await prisma.applicantProfile.create({
          data: {
            ...data,
            passportNumber: encrypt(data.passportNumber),
            userId: req.user!.userId,
          },
        });
        created.push(profile.id);
      } catch (err) {
        errors.push({ row: i + 2, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({ created: created.length, errors });
  } catch {
    res.status(500).json({ error: 'Bulk upload failed' });
  }
});
