import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registrarComando } from "./pi/comando.ts";
import { registrarEventos } from "./pi/eventos.ts";
import { registrarFerramentas } from "./pi/ferramentas.ts";
import { registrarFerramentasFechamento } from "./pi/ferramentasFechamento.ts";

export default function ryker(pi: ExtensionAPI): void {
  registrarFerramentas(pi);
  registrarFerramentasFechamento(pi);
  registrarComando(pi);
  registrarEventos(pi);
}
