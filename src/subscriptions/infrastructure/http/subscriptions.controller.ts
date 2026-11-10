import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { CancelSubscriptionUseCase } from '../../application/cancel-subscription.use-case';
import { ConfigureSubscriptionUseCase } from '../../application/configure-subscription.use-case';
import { GetSubscriptionUseCase } from '../../application/get-subscription.use-case';
import { ListPaymentsUseCase } from '../../application/list-payments.use-case';
import { ReactivateSubscriptionUseCase } from '../../application/reactivate-subscription.use-case';
import { RecordPaymentUseCase } from '../../application/record-payment.use-case';
import { ConfigureSubscriptionDto, RecordPaymentDto } from './subscriptions.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Super admin: the annual plan of every center and its payments.
@ApiTags('platform')
@Auth(Role.SUPER_ADMIN)
@Controller('platform')
export class PlatformSubscriptionsController {
  constructor(
    private readonly getSubscription: GetSubscriptionUseCase,
    private readonly payments: ListPaymentsUseCase,
    private readonly recordPayment: RecordPaymentUseCase,
    private readonly configure: ConfigureSubscriptionUseCase,
    private readonly cancelSubscription: CancelSubscriptionUseCase,
    private readonly reactivateSubscription: ReactivateSubscriptionUseCase,
  ) {}

  @Get('payments')
  @ApiOperation({ summary: 'All recorded payments, newest to oldest (paginated)' })
  all(@Query() query: PaginationQuery) {
    return this.payments.all(query);
  }

  @Get('institutions/:id/subscription')
  @ApiOperation({ summary: "A center's plan with its effective status and remaining days" })
  get(@Param('id', uuid) id: string) {
    return this.getSubscription.execute(id);
  }

  @Patch('institutions/:id/subscription')
  @ApiOperation({ summary: "Sets a center's annual fee" })
  update(@Param('id', uuid) id: string, @Body() dto: ConfigureSubscriptionDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.configure.execute(id, dto.priceCents, { id: actorId, ip: req.ip });
  }

  @Get('institutions/:id/payments')
  @ApiOperation({ summary: "A center's payments (paginated)" })
  ofCenter(@Param('id', uuid) id: string, @Query() query: PaginationQuery) {
    return this.payments.ofCenter(id, query);
  }

  @Post('institutions/:id/payments')
  @ApiOperation({ summary: 'Records the annual payment and extends the plan by one year' })
  pay(@Param('id', uuid) id: string, @Body() dto: RecordPaymentDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.recordPayment.execute(id, dto, { id: actorId, ip: req.ip });
  }

  @Post('institutions/:id/subscription/cancel')
  @ApiOperation({ summary: "Cancels a center's plan" })
  cancel(@Param('id', uuid) id: string, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.cancelSubscription.execute(id, { id: actorId, ip: req.ip });
  }

  @Post('institutions/:id/subscription/reactivate')
  @ApiOperation({ summary: "Restores a center's canceled plan" })
  reactivate(@Param('id', uuid) id: string, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.reactivateSubscription.execute(id, { id: actorId, ip: req.ip });
  }
}

// Center admin: their own plan, read only.
@ApiTags('subscription')
@Auth(Role.ADMIN)
@Controller('subscription')
export class CenterSubscriptionController {
  constructor(
    private readonly getSubscription: GetSubscriptionUseCase,
    private readonly payments: ListPaymentsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "My center's plan with its effective status and remaining days" })
  get() {
    return this.getSubscription.execute();
  }

  @Get('payments')
  @ApiOperation({ summary: "My center's payments (paginated)" })
  listPayments(@Query() query: PaginationQuery) {
    return this.payments.own(query);
  }
}
