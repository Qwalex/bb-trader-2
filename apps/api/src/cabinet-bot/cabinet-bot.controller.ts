import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CabinetBotService } from './cabinet-bot.service.js';

@Controller('cabinet-bot')
export class CabinetBotController {
  constructor(private readonly cabinetBot: CabinetBotService) {}

  @Post('webhook/:webhookSecret')
  @HttpCode(200)
  async webhook(@Param('webhookSecret') webhookSecret: string, @Body() body: unknown) {
    return this.cabinetBot.handleWebhook(webhookSecret, body);
  }
}
