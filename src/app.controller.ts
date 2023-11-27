import {
  Controller,
  Get,
  Param,
  Put,
  Post,
  Delete,
  Req,
  UseInterceptors,
  UploadedFile,
  Body,
  Redirect,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';
import { Public } from './decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('/')
  @Redirect(process.env.HOMEPAGE_URL, HttpStatus.FOUND)
  redirectToHomepage() {
    console.log('Redirecting to homepage', process.env.HOMEPAGE_URL);
  }

  @Public()
  @Get(':contentname')
  getContent(
    @Req() request: Request,
    @Param('contentname') contentname: string,
  ) {
    console.log(request.headers);
    return this.appService.getContent();
  }

  @Post('/')
  @UseInterceptors(FileInterceptor('file'))
  uploadContent(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
    @Param('contentname') contentname: string,
  ) {}

  @Put('/:contentname')
  @UseInterceptors(FileInterceptor('file'))
  updateContent(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
    @Param('contentname') contentname: string,
  ) {}

  @Delete('/:contentname')
  deleteContent(
    @Req() request: Request,
    @Param('contentname') contentname: string,
  ) {}

  @Public()
  @Post('auth/login')
  login(
    @Req() request: Request,
    @Body('username') username: string,
    @Body('password') password: string,
  ) {}
}
