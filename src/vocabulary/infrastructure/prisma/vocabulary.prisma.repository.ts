import { Injectable } from '@nestjs/common';
import { CategoriesPrismaMapper } from '../../../categories/infrastructure/prisma/categories.prisma.mapper';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PictogramsPrismaMapper } from '../../../pictograms/infrastructure/prisma/pictograms.prisma.mapper';
import { PrismaService } from '../../../prisma/prisma.service';
import { VocabularyRepository } from '../../domain/ports/vocabulary.repository';

@Injectable()
export class VocabularyPrismaRepository extends VocabularyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Spec 105 FR-003: a category without active pictograms does not reach the tablet (it is hidden from the board).
  async listVocabulary(page: PageRequest) {
    const visible = { active: true, pictograms: { some: { pictogram: { active: true } } } };
    const [rows, total] = await Promise.all([
      this.prisma.category.findMany({
        where: visible,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          pictograms: {
            where: { pictogram: { active: true } },
            orderBy: [{ sortOrder: 'asc' }, { pictogramId: 'asc' }],
            include: { pictogram: true },
          },
        },
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.category.count({ where: visible }),
    ]);
    const items = rows.map((row) => ({
      category: CategoriesPrismaMapper.toDomain(row),
      pictograms: row.pictograms.map((link) => PictogramsPrismaMapper.toDomain(link.pictogram)),
    }));
    return toPage(items, total, page);
  }
}
