import { Injectable } from '@nestjs/common';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PictogramsPrismaMapper } from '../../../pictograms/infrastructure/prisma/pictograms.prisma.mapper';
import { PrismaService } from '../../../prisma/prisma.service';
import { Category } from '../../domain/entities/category.entity';
import { CategoriesRepository } from '../../domain/ports/categories.repository';
import { CategoriesPrismaMapper as M } from './categories.prisma.mapper';

@Injectable()
export class CategoriesPrismaRepository extends CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listCategories(page: PageRequest) {
    const [rows, total] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { pictograms: true } } },
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.category.count(),
    ]);
    return toPage(
      rows.map((row) => ({ category: M.toDomain(row), pictogramCount: row._count.pictograms })),
      total,
      page,
    );
  }

  async findCategory(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row ? M.toDomain(row) : null;
  }

  async findCategoryByName(name: string) {
    const row = await this.prisma.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    return row ? M.toDomain(row) : null;
  }

  async saveCategory(category: Category) {
    const data = M.toPrisma(category);
    await this.prisma.category.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async listCategoryPictograms(categoryId: string, page: PageRequest) {
    const [links, total] = await Promise.all([
      this.prisma.categoryPictogram.findMany({
        where: { categoryId },
        orderBy: [{ sortOrder: 'asc' }, { pictogramId: 'asc' }],
        include: { pictogram: true },
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.categoryPictogram.count({ where: { categoryId } }),
    ]);
    return toPage(
      links.map((link) => PictogramsPrismaMapper.toDomain(link.pictogram)),
      total,
      page,
    );
  }

  async replaceCategoryPictograms(categoryId: string, pictogramIds: string[]) {
    await this.prisma.$transaction([
      this.prisma.categoryPictogram.deleteMany({ where: { categoryId } }),
      this.prisma.categoryPictogram.createMany({
        data: pictogramIds.map((pictogramId, sortOrder) => ({ categoryId, pictogramId, sortOrder })),
      }),
    ]);
  }

  // ponytail: two simultaneous additions to the same category may end up with the same order; resolved by reordering (PUT).
  async addToCategory(categoryId: string, pictogramId: string) {
    const { _max } = await this.prisma.categoryPictogram.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
    await this.prisma.categoryPictogram.createMany({
      data: [{ categoryId, pictogramId, sortOrder: (_max.sortOrder ?? -1) + 1 }],
      skipDuplicates: true,
    });
  }

  async removeFromCategory(categoryId: string, pictogramId: string) {
    await this.prisma.categoryPictogram.deleteMany({ where: { categoryId, pictogramId } });
  }
}
