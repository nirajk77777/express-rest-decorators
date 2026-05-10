import 'reflect-metadata';
import { Controller, Get } from '../../../src/index.js';

@Controller('/alpha')
export class AlphaController {
  @Get('/')
  hi() {
    return { ok: 'alpha' };
  }
}
