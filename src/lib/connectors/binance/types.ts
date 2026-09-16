export interface ExchangeInfo { symbols: { symbol: string; baseAsset: string; quoteAsset: string; status: string }[] }
export interface AccountInfo { balances: { asset: string; free: string; locked: string }[]; canTrade?: boolean; permissions?: string[] }
export interface MyTrade { symbol: string; id: number; orderId: number; price: string; qty: string; quoteQty: string; commission: string; commissionAsset: string; time: number; isBuyer: boolean; isMaker: boolean }
export interface DepositRecord { id: string; amount: string; coin: string; network: string; status: number; address: string; addressTag?: string; txId: string; insertTime: number; transferType: number; confirmTimes?: string }
export interface WithdrawRecord { id: string; amount: string; transactionFee: string; coin: string; status: number; address: string; txId: string; applyTime: string; completeTime?: string; network: string; transferType: number; info?: string; walletType?: number }
export interface FiatOrder { orderNo: string; fiatCurrency: string; indicatedAmount: string; amount: string; totalFee: string; method: string; status: string; createTime: number; updateTime: number }
export interface FiatPayment { orderNo: string; sourceAmount: string; fiatCurrency: string; obtainAmount: string; cryptoCurrency: string; totalFee: string; price: string; status: string; paymentMethod?: string; createTime: number; updateTime: number }
export interface ConvertTrade { quoteId: string; orderId: number | string; orderStatus: string; fromAsset: string; fromAmount: string; toAsset: string; toAmount: string; ratio: string; inverseRatio: string; createTime: number }
export interface DustLog { total: number; userAssetDribblets: { operateTime: number; totalTransferedAmount: string; totalServiceChargeAmount: string; transId: number; userAssetDribbletDetails: { transId: number; serviceChargeAmount: string; amount: string; operateTime: number; transferedAmount: string; fromAsset: string }[] }[] }
export interface AssetDividend { rows: { id: number; amount: string; asset: string; divTime: number; enInfo: string; tranId: number }[]; total: number }
export interface EarnReward { amount: string; asset: string; time: number; type?: string; positionId?: string; lockPeriod?: string }
export interface Kline extends Array<string | number> { 0: number; 1: string; 2: string; 3: string; 4: string; 5: string; 6: number }
