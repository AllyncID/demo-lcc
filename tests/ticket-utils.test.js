import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTicketToken, ticketReturnPath } from '../src/ticket-utils.ts';
const token='A'.repeat(43), origin='http://localhost:3001';
test('scanner accepts a ticket token or this site verification URL only',()=>{
  assert.equal(extractTicketToken(token,origin),token);
  assert.equal(extractTicketToken('  '+origin+'/tiket/verifikasi/'+token+'  ',origin),token);
  assert.equal(extractTicketToken('/tiket/verifikasi/'+token,origin),token);
  for(const input of ['https://other.test/tiket/verifikasi/'+token,'//other.test/tiket/verifikasi/'+token,'javascript:alert(1)','<img src=x>','12',origin+'/admin?token='+token]) assert.equal(extractTicketToken(input,origin),null,input);
});
test('admin login return target is restricted to the ticket verification route',()=>{
  assert.equal(ticketReturnPath('/tiket/verifikasi/'+token),'/tiket/verifikasi/'+token);
  for(const input of [null,'https://other.test','//other.test','/admin','/tiket/verifikasi/'+token+'?next=https://other.test','/tiket/verifikasi/../admin']) assert.equal(ticketReturnPath(input),null);
});
