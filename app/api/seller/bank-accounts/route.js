import { NextResponse } from 'next/server';
import { bankAccountService } from '@/services/bankAccountService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get('sellerId');

    if (!sellerId) {
      return NextResponse.json({ success: false, error: 'Seller ID is required.' }, { status: 400 });
    }

    const accounts = await bankAccountService.getBankAccounts(sellerId);
    return NextResponse.json({ success: true, data: accounts });
  } catch (err) {
    console.error('❌ [API GET /api/seller/bank-accounts] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { sellerId, accountHolderName, bankName, accountNumber, confirmAccountNumber, ifscCode, accountType } = body;

    if (!sellerId) {
      return NextResponse.json({ success: false, error: 'Seller ID is required.' }, { status: 400 });
    }

    const res = await bankAccountService.addBankAccount(sellerId, {
      accountHolderName,
      bankName,
      accountNumber,
      confirmAccountNumber,
      ifscCode,
      accountType
    });

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: res.bankAccount });
  } catch (err) {
    console.error('❌ [API POST /api/seller/bank-accounts] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get('sellerId');
    const bankAccountId = searchParams.get('bankAccountId');

    if (!sellerId || !bankAccountId) {
      return NextResponse.json({ success: false, error: 'Seller ID and Bank Account ID are required.' }, { status: 400 });
    }

    const res = await bankAccountService.deleteBankAccount(sellerId, bankAccountId);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ [API DELETE /api/seller/bank-accounts] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
