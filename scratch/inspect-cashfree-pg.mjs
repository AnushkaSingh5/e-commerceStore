// scratch/inspect-cashfree-pg.mjs
import * as cashfreePg from 'cashfree-pg';

console.log('Cashfree PG exports:', Object.keys(cashfreePg));
console.log('Cashfree type:', typeof cashfreePg.Cashfree);
if (cashfreePg.Cashfree) {
  console.log('Cashfree prototype methods:', Object.getOwnPropertyNames(cashfreePg.Cashfree.prototype));
  console.log('Cashfree static properties:', Object.getOwnPropertyNames(cashfreePg.Cashfree));
}
if (cashfreePg.CFEnvironment) {
  console.log('CFEnvironment:', cashfreePg.CFEnvironment);
}
