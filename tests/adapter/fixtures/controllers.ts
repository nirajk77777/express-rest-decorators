import 'reflect-metadata';
import {
  Controller,
  JsonController,
  Get,
  Post,
  OnNull,
  OnUndefined,
} from '../../../src/index.js';
import { zodUserBody, zodIdParams } from './schemas.js';

@JsonController('/users')
export class UsersController {
  @Get('/:id', { params: zodIdParams })
  getById({ params }: { params: { id: number } }) {
    return { id: params.id, name: `user-${params.id}` };
  }

  @Post('/', { body: zodUserBody })
  create({ body }: { body: { email: string; name: string } }) {
    return { created: true, email: body.email, name: body.name };
  }

  @Get('/null')
  @OnNull(404)
  alwaysNull() {
    return null;
  }

  @Get('/undef')
  @OnUndefined(204)
  alwaysUndef() {
    return undefined;
  }
}

@Controller('/text')
export class TextController {
  @Get('/hello')
  hello() {
    return 'hello world';
  }

  @Get('/buffer')
  buf() {
    return Buffer.from('binary');
  }
}

// Inheritance fixture for ROUTE-05 (subclass-wins semantics from Phase 1 D-06)
@JsonController('/base')
export class BaseController {
  @Get('/ping')
  ping() {
    return { from: 'base' };
  }
}

@JsonController('/derived')
export class DerivedController extends BaseController {
  @Get('/own')
  own() {
    return { from: 'derived' };
  }
}
