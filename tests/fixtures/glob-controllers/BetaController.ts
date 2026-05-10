import 'reflect-metadata';
import { Controller, Get } from '../../../src/index.js';

@Controller('/beta')
export class BetaController {
  @Get('/')
  hi() {
    return { ok: 'beta' };
  }
}
