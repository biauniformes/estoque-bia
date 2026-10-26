/**
 * Ligação inicial dos códigos da ORBENK (66.xxxx) com os nossos modelos.
 * "confirmado: true"  = o nome bate E os preços das OCs batem com a nossa lista (conferido nas 28 OCs de exemplo).
 * "confirmado: false" = só pelo nome (aparece com aviso até alguém confirmar na tela Ligações).
 */
export type Lig = [cod: string, modelo: string | null, confirmado: boolean];

export const MODELOS_ORBENK: Lig[] = [
  ["66.0007", "630.004", true], // Jaqueta Nylon Paraquedista Azul Noite
  ["66.0021", "420.004", false], // Camisa Operacional PV MC Refletiva Azul
  ["66.0027", "250.005", true], // Calça Operacional Masc. Refletivo Azul
  ["66.0028", "285.002", true], // Calça Jeans Masc. Azul
  ["66.0031", "250.003", true], // Calça Operacional Masc. Branca
  ["66.0042", "600.002", true], // Jaqueta Operacional Unissex Azul
  ["66.0044", "440.002", true], // Camisa Operacional ML PV Branca
  ["66.0053", "975.003", false], // Touca Suplex c/ Rede Bordado Branca
  ["66.0054", "600.003", true], // Jaqueta Operacional Branca
  ["66.0057", "420.003", true], // Camisa Operacional MC PV Azul
  ["66.0058", "440.003", true], // Camisa Operacional ML PV Azul
  ["66.0059", "420.002", true], // Camisa Operacional MC PV Branca
  ["66.0091", "800.002", true], // Moletom Unissex Azul s/ Zíper
  ["66.0103", "860.002", true], // Moletom Unissex c/ Zíper e Capuz Azul
  ["66.0151", "275.002", true], // Calça Tática Completa Masc. Rip Stop Azul Noite
  ["66.0167", "370.002", true], // Camisa Operacional Rip Stop MC Azul Noite
  ["66.0178", "260.002", true], // Calça Operacional Tactel Unissex Azul
  ["66.0185", "280.002", true], // Calça Jeans Fem. Azul
  ["66.0203", "630.002", true], // Jaqueta Nylon Unissex s/ Capuz Azul
  ["66.0223", "680.003", true], // Jaqueta Nylon Unissex c/ Capuz Preta
  ["66.0224", "680.002", true], // Jaqueta Nylon Unissex c/ Capuz Azul
  ["66.0226", "965.004", true], // Suéter Unissex Preta
  ["66.0270", "965.002", true], // Suéter Unissex Azul
  ["66.0277", "330.004", true], // Camisa Gola Polo MC Azul
  ["66.0278", "330.005", true], // Camisa Gola Polo MC Branca
  ["66.0303", "250.002", true], // Calça Operacional Unissex c/ Elástico Azul
  ["66.0304", "270.003", true], // Calça Operacional Unissex c/ Elástico e Zíper Azul
  ["66.0530", "420.003", false], // Camiseta Op. PV MC Azul "Almoxarife"
  ["66.0531", "440.003", false], // Camiseta Op. PV ML Azul "Almoxarife"
  ["66.0532", "250.002", false], // Calça Op. c/ Elástico Azul "Almoxarife"
  ["66.0537", "420.007", false], // Camiseta Op. PV MC Azul "Carregador"
  ["66.0538", "440.007", false], // Camiseta Op. PV ML Azul "Carregador"
  ["66.0539", "250.002", false], // Calça Op. c/ Elástico Azul "Carregador"
  ["66.0529", "800.002", false], // Moletom Azul FURG "Almoxarife"
  ["66.0536", "800.002", false], // Moletom Azul FURG "Carregador"
  ["66.0549", "800.002", false], // Moletom Azul FURG "Aux. ADM"
  ["66.0563", "330.004", false], // Camisa Gola Polo Azul "Aux. ADM"
  ["66.0573", "330.007", true], // Camisa Gola Polo Azul "Detran SC"
  ["66.0575", "420.009", true], // Camiseta Op. PV MC c/ logo Medianeira
  ["66.0651", "330.005", false], // Camisa Gola Polo Branca "DER" Bordar
  ["67.0060", "240.002", true], // Boné Operacional Azul Estampado
  ["67.0488", "240.002", false], // Boné Op. Estampado Azul CA 041/2022
  // sem equivalente claro na nossa lista: ficam para ligar na tela
  ["66.0002", null, false], // Bata Operacional Azul
  ["66.0036", null, false], // Bermuda Operacional Brim Azul
  ["66.0038", null, false], // Touca Toule Azul
  ["66.0045", null, false], // Avental Bolso Canguru Oxford Branca
  ["66.0046", null, false], // Avental Bolso Canguru Oxford Azul
  ["66.0062", null, false], // Jaqueta Nylon Azul c/ Capuz e Refl. Laranja
  ["66.0315", null, false], // Jaleco c/ Gola 3 Bolsos ML Azul
  ["66.0317", null, false], // Jaleco Gola V 2 Bolsos Oxfordini MC Azul
  ["66.0350", null, false], // Camisa Gola Polo 95% Algodão MC Preta
  ["66.0353", null, false], // Avental Bolso Canguru Oxford Preta
  ["66.0461", null, false], // Jaleco Copeira MC Azul Marinho Spandex
  ["66.0540", null, false], // Jaqueta Nylon Imp. c/ Capuz Azul "Carregador"
  ["66.0547", null, false], // Touca Suplex c/ Rede FURG Copeira
  ["66.0607", null, false], // Calça Oper. Oxford Unissex c/ Elástico Azul
];

/** Conversão de tamanhos do cliente (vale para todos os produtos). EGG fica sem conversão até alguém definir. */
export const TAMANHOS_GLOBAIS_ORBENK: [string, string][] = [
  ["PP", "PP"], ["P", "P"], ["M", "M"], ["G", "G"], ["GG", "GG"], ["XG", "XG"], ["EG", "XG"],
  ["G1", "G1"], ["G2", "G2"], ["G3", "G3"], ["G4", "G4"], ["G5", "G5"], ["U", "ÚNICO"],
];
/** A calça zíper (66.0304) pede P/M/G, mas o nosso cadastro é por número (visto nas OCs: P=36, M=40, G=46). */
export const TAMANHOS_POR_PRODUTO_ORBENK: [string, string, string][] = [
  ["66.0304", "P", "36"], ["66.0304", "M", "40"], ["66.0304", "G", "46"],
];

