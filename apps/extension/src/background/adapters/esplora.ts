export interface EsploraUtxo {
  readonly txid: string;
  readonly vout: number;
  readonly value: number;
}

function numberField(obj: unknown, key: string): number {
  if (typeof obj !== "object" || obj === null) return 0;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

// Minimal Esplora (Blockstream) client for UTXOs, fee rate, and broadcast.
// Wrapped as the Bitcoin adapter's providers in chains.ts.
export class EsploraClient {
  constructor(private readonly baseUrl: string) {}

  async utxos(address: string): Promise<EsploraUtxo[]> {
    const data = await this.#json(`/address/${address}/utxo`);
    if (!Array.isArray(data)) return [];
    return data.flatMap((entry): EsploraUtxo[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const { txid, vout, value } = entry as Record<string, unknown>;
      if (typeof txid === "string" && typeof vout === "number" && typeof value === "number") {
        return [{ txid, vout, value }];
      }
      return [];
    });
  }

  async feeRateSatsPerVbyte(): Promise<number> {
    const rate = numberField(await this.#json("/fee-estimates"), "6");
    return rate > 0 ? Math.ceil(rate) : 5;
  }

  async broadcast(txHex: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/tx`, { method: "POST", body: txHex });
    if (!response.ok) throw new Error(`Broadcast failed: ${await response.text()}`);
    return response.text();
  }

  async #json(path: string): Promise<unknown> {
    const response = await fetch(this.baseUrl + path);
    if (!response.ok) throw new Error(`Esplora request failed (${String(response.status)})`);
    return response.json();
  }
}
