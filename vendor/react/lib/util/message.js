'use strict';
// Oxlint implements the modern messageId reporting contract.
module.exports=function getMessageData(messageId,message){return messageId?{messageId}:{message};};
