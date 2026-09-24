export function BrokerBrand({provider}:{provider:'tradovate'|'rithmic'}){
 return <span className="broker-brand"><span className="sr-only">{provider==='tradovate'?'Tradovate / NinjaTrader':'Rithmic'}</span>{provider==='tradovate'?<><img className="tradovate-wordmark" src="/media/brokers/tradovate.png" alt="" aria-hidden="true"/><span className="broker-slash" aria-hidden="true">/</span><img className="ninjatrader-wordmark" src="/media/brokers/ninjatrader.svg" alt="" aria-hidden="true"/></>:<img className="rithmic-wordmark" src="/media/brokers/rithmic.png" alt="" aria-hidden="true"/>}</span>;
}
