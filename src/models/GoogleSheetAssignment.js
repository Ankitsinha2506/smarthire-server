import mongoose from 'mongoose';

const googleSheetAssignmentSchema=new mongoose.Schema({
  spreadsheetId:{type:String,required:true},
  sheetRow:{type:Number,required:true},
  assignedStaff:[{type:mongoose.Schema.Types.ObjectId,ref:'User'}],
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

googleSheetAssignmentSchema.index({spreadsheetId:1,sheetRow:1},{unique:true});

export default mongoose.model('GoogleSheetAssignment',googleSheetAssignmentSchema);
