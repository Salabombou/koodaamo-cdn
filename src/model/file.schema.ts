import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
//export type UserDocument = User & Document;

@Schema()
export class File {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  id: string;

  @Prop({ required: true })
  expires: Date;

  @Prop({ default: Date.now() })
  createdDate: Date;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  data: string;

  @Prop()
  width: number;

  @Prop()
  height: number;

  @Prop()
  size: number;
}
export const FileSchema = SchemaFactory.createForClass(File);
