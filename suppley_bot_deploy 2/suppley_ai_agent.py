#!/usr/bin/env python3
"""
Suppley AI Agent - Head of AI Virtual
Agente estratégico de IA para auxiliar na transformação digital da Suppley

Autor: Manus AI
Data: Outubro 2025
Versão: 1.0
"""

import os
import json
from datetime import datetime
from openai import OpenAI

class SupplyAIAgent:
    """
    Agente de IA que atua como Head of AI Virtual da Suppley.
    Auxilia em decisões estratégicas, planejamento de implementação de IA,
    e evolui conforme é treinado com dados da empresa.
    """
    
    def __init__(self):
        self.client = OpenAI()  # API key já configurada no ambiente
        self.model = "gpt-4.1-mini"  # Modelo otimizado para raciocínio estratégico
        
        # Base de conhecimento do agente
        self.knowledge_base = {
            "empresa": {
                "nome": "Suppley Raw Material",
                "setor": "Importação e desenvolvimento de produtos para construção civil e indústria",
                "produtos": ["ferro", "aço", "pregos", "arames", "escoras metálicas", "acabamentos", "equipamentos"],
                "armazens": ["Cuiabá", "Pernambuco", "Extrema", "Ilhota", "São Caetano/Campinas", "Navegantes"],
                "sede": "Itajaí, SC",
                "tempo_mercado": "11 meses",
                "grupo": ["CONTLOG", "Seaforte", "FST Full Service Brasil", "Tributo Justo"]
            },
            "contexto_estrategico": {
                "objetivo": "Transformar a Suppley em líder de inovação usando IA",
                "timeline_agi": "AGI prevista para 2027 (3-4 anos)",
                "oportunidades": [
                    "Boom de construção de datacenters para IA",
                    "Setor de construção civil pouco digitalizado",
                    "Demanda por materiais sustentáveis e inteligentes"
                ],
                "gaps_criticos": [
                    "Tecnologia e automação",
                    "Inteligência Artificial",
                    "Presença internacional",
                    "Compliance e ESG"
                ]
            },
            "plano_implementacao": {
                "trilha_1": "Transformação da Suppley com IA",
                "trilha_2": "Produtos Físicos Inteligentes",
                "trilha_3": "Novos Modelos de Negócio",
                "trilha_4": "Posicionamento Estratégico",
                "investimento_total": "R$ 4,5-6M em 36 meses",
                "roi_esperado": "190-280%"
            },
            "projetos_prioritarios": [
                {
                    "nome": "Suppley AI Assistant",
                    "descricao": "Automação de documentos, cotações e atendimento",
                    "investimento": "R$ 80-120k",
                    "prazo": "3 meses",
                    "roi": "Redução de 60% no tempo de processamento"
                },
                {
                    "nome": "Escoras Metálicas Inteligentes",
                    "descricao": "Escoras com sensores IoT e monitoramento em tempo real",
                    "investimento": "R$ 300-600k",
                    "prazo": "12-18 meses",
                    "roi": "Margem 3x superior a escoras tradicionais"
                },
                {
                    "nome": "Kit Datacenter Suppley",
                    "descricao": "Linha especializada para construção de datacenters",
                    "investimento": "R$ 200-400k",
                    "prazo": "6-12 meses",
                    "roi": "Margem premium de 30-50%"
                }
            ]
        }
        
        # Histórico de conversas para aprendizado
        self.conversation_history = []
        
        # Arquivo para persistir aprendizados
        self.learning_file = "/home/ubuntu/suppley_ai_learnings.json"
        self.load_learnings()
    
    def load_learnings(self):
        """Carrega aprendizados anteriores do arquivo"""
        if os.path.exists(self.learning_file):
            with open(self.learning_file, 'r', encoding='utf-8') as f:
                self.learnings = json.load(f)
        else:
            self.learnings = {
                "decisoes_tomadas": [],
                "insights_usuario": [],
                "contexto_especifico": {},
                "historico_consultas": []
            }
    
    def save_learnings(self):
        """Salva aprendizados no arquivo"""
        with open(self.learning_file, 'w', encoding='utf-8') as f:
            json.dump(self.learnings, f, indent=2, ensure_ascii=False)
    
    def get_system_prompt(self):
        """Retorna o prompt de sistema que define o comportamento do agente"""
        return f"""Você é o Head of AI Virtual da Suppley, um agente de IA estratégico criado para auxiliar o CEO na transformação digital da empresa.

CONTEXTO DA EMPRESA:
{json.dumps(self.knowledge_base, indent=2, ensure_ascii=False)}

APRENDIZADOS ACUMULADOS:
{json.dumps(self.learnings, indent=2, ensure_ascii=False)}

SEU PAPEL:
1. Assessor Estratégico: Ajudar a tomar decisões sobre implementação de IA
2. Planejador: Criar roadmaps detalhados e priorizar ações
3. Educador: Explicar conceitos de IA de forma prática e aplicável
4. Executor: Fornecer código, templates e recursos prontos para uso
5. Analista: Avaliar oportunidades, riscos e ROI de projetos

COMO VOCÊ DEVE RESPONDER:
- Seja PRÁTICO e ACIONÁVEL: Sempre forneça próximos passos concretos
- Seja ESPECÍFICO para a Suppley: Use o contexto da empresa em todas as respostas
- Seja REALISTA: Considere budget limitado e recursos disponíveis
- Seja EDUCATIVO: Explique o "porquê" por trás das recomendações
- Seja PROATIVO: Sugira oportunidades que o usuário pode não ter considerado

FORMATO DE RESPOSTA:
1. Resposta direta à pergunta
2. Contexto e raciocínio
3. Próximos passos acionáveis
4. Recursos/ferramentas necessários
5. Riscos e mitigações (se aplicável)

LEMBRE-SE:
- Budget limitado: Priorize soluções de baixo custo e alto impacto
- Urgência: AGI em 2027 = janela de 3-4 anos
- Foco: Construção civil, indústria e datacenters
- Objetivo final: Transformar Suppley em líder de inovação"""

    def chat(self, user_message, save_to_history=True):
        """
        Conversa com o agente e obtém resposta estratégica
        
        Args:
            user_message: Mensagem/pergunta do usuário
            save_to_history: Se deve salvar na história de conversas
            
        Returns:
            Resposta do agente
        """
        # Adicionar mensagem do usuário ao histórico
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })
        
        # Preparar mensagens para a API
        messages = [
            {"role": "system", "content": self.get_system_prompt()}
        ] + self.conversation_history
        
        # Chamar a API
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.7,
            max_tokens=2000
        )
        
        # Extrair resposta
        assistant_message = response.choices[0].message.content
        
        # Adicionar resposta ao histórico
        self.conversation_history.append({
            "role": "assistant",
            "content": assistant_message
        })
        
        # Salvar consulta no histórico de aprendizados
        if save_to_history:
            self.learnings["historico_consultas"].append({
                "timestamp": datetime.now().isoformat(),
                "pergunta": user_message,
                "resposta": assistant_message[:200] + "..."  # Resumo
            })
            self.save_learnings()
        
        return assistant_message
    
    def registrar_decisao(self, decisao, contexto=""):
        """
        Registra uma decisão tomada para aprendizado futuro
        
        Args:
            decisao: Descrição da decisão
            contexto: Contexto adicional da decisão
        """
        self.learnings["decisoes_tomadas"].append({
            "timestamp": datetime.now().isoformat(),
            "decisao": decisao,
            "contexto": contexto
        })
        self.save_learnings()
        return f"✅ Decisão registrada: {decisao}"
    
    def adicionar_insight(self, insight, categoria="geral"):
        """
        Adiciona um insight ou aprendizado específico da empresa
        
        Args:
            insight: O insight a ser registrado
            categoria: Categoria do insight (clientes, fornecedores, processos, etc)
        """
        self.learnings["insights_usuario"].append({
            "timestamp": datetime.now().isoformat(),
            "categoria": categoria,
            "insight": insight
        })
        self.save_learnings()
        return f"✅ Insight registrado na categoria '{categoria}': {insight}"
    
    def atualizar_contexto(self, chave, valor):
        """
        Atualiza informações específicas do contexto da empresa
        
        Args:
            chave: Chave do contexto (ex: "budget_disponivel", "prioridade_atual")
            valor: Valor a ser armazenado
        """
        self.learnings["contexto_especifico"][chave] = {
            "valor": valor,
            "atualizado_em": datetime.now().isoformat()
        }
        self.save_learnings()
        return f"✅ Contexto atualizado: {chave} = {valor}"
    
    def analisar_projeto(self, nome_projeto, descricao=""):
        """
        Analisa um projeto específico e fornece recomendações
        
        Args:
            nome_projeto: Nome do projeto a analisar
            descricao: Descrição adicional do projeto
        """
        prompt = f"""Analise o seguinte projeto para a Suppley:

PROJETO: {nome_projeto}
DESCRIÇÃO: {descricao}

Forneça uma análise completa incluindo:
1. Viabilidade técnica
2. Investimento estimado
3. ROI esperado
4. Prazo de implementação
5. Riscos principais
6. Próximos passos para começar
7. Recursos/parceiros necessários

Seja específico e prático."""
        
        return self.chat(prompt)
    
    def criar_roadmap(self, objetivo, prazo_meses=12):
        """
        Cria um roadmap detalhado para um objetivo específico
        
        Args:
            objetivo: O objetivo a ser alcançado
            prazo_meses: Prazo em meses
        """
        prompt = f"""Crie um roadmap detalhado para alcançar o seguinte objetivo:

OBJETIVO: {objetivo}
PRAZO: {prazo_meses} meses

O roadmap deve incluir:
1. Fases principais (com duração)
2. Ações específicas em cada fase
3. Investimento por fase
4. Resultados esperados (KPIs)
5. Dependências críticas
6. Quick wins (resultados rápidos)

Formate como um plano de ação executável."""
        
        return self.chat(prompt)
    
    def sugerir_proximos_passos(self):
        """
        Sugere os próximos passos mais importantes baseado no contexto atual
        """
        prompt = """Baseado em tudo que você sabe sobre a Suppley e nosso plano de transformação com IA, 
quais são os 3-5 próximos passos MAIS IMPORTANTES que devo tomar nas próximas 2-4 semanas?

Para cada passo, indique:
1. O que fazer exatamente
2. Por que é prioritário
3. Quanto vai custar (estimativa)
4. Quanto tempo vai levar
5. Que resultado esperar

Seja ultra-específico e prático."""
        
        return self.chat(prompt)
    
    def explicar_conceito(self, conceito):
        """
        Explica um conceito de IA de forma prática e aplicada à Suppley
        
        Args:
            conceito: O conceito a ser explicado
        """
        prompt = f"""Explique o conceito de "{conceito}" de forma:
1. Simples e clara (sem jargão técnico desnecessário)
2. Aplicada à realidade da Suppley
3. Com exemplos práticos de como usar
4. Com estimativa de custo/benefício

Objetivo: Eu preciso entender isso para tomar decisões informadas."""
        
        return self.chat(prompt)
    
    def avaliar_fornecedor(self, nome_fornecedor, servico, proposta=""):
        """
        Avalia uma proposta de fornecedor de tecnologia/IA
        
        Args:
            nome_fornecedor: Nome do fornecedor
            servico: Serviço oferecido
            proposta: Detalhes da proposta (opcional)
        """
        prompt = f"""Preciso avaliar esta proposta de fornecedor:

FORNECEDOR: {nome_fornecedor}
SERVIÇO: {servico}
PROPOSTA: {proposta}

Analise:
1. Se faz sentido para a Suppley neste momento
2. Se o preço está justo (se informado)
3. Alternativas mais baratas ou melhores
4. Perguntas que devo fazer ao fornecedor
5. Recomendação final: contratar, negociar ou recusar

Seja direto e honesto."""
        
        return self.chat(prompt)
    
    def gerar_relatorio_progresso(self):
        """
        Gera um relatório de progresso baseado nas decisões e insights registrados
        """
        prompt = f"""Baseado no histórico de decisões e insights que registrei, 
crie um relatório de progresso da transformação de IA da Suppley.

DECISÕES TOMADAS: {len(self.learnings['decisoes_tomadas'])}
INSIGHTS REGISTRADOS: {len(self.learnings['insights_usuario'])}
CONSULTAS REALIZADAS: {len(self.learnings['historico_consultas'])}

O relatório deve incluir:
1. Resumo do que já foi feito
2. Principais conquistas
3. Desafios identificados
4. Próximas prioridades
5. Recomendações de ajuste

Seja encorajador mas realista."""
        
        return self.chat(prompt)
    
    def reset_conversation(self):
        """Limpa o histórico de conversação (mas mantém os aprendizados)"""
        self.conversation_history = []
        return "✅ Histórico de conversação limpo. Aprendizados mantidos."


def main():
    """Função principal para testar o agente"""
    print("=" * 80)
    print("SUPPLEY AI AGENT - Head of AI Virtual")
    print("=" * 80)
    print("\nAgente inicializado com sucesso!")
    print("\nComandos disponíveis:")
    print("  - chat: Conversar com o agente")
    print("  - decisao: Registrar uma decisão")
    print("  - insight: Adicionar um insight")
    print("  - projeto: Analisar um projeto")
    print("  - roadmap: Criar um roadmap")
    print("  - proximos: Sugerir próximos passos")
    print("  - explicar: Explicar um conceito")
    print("  - fornecedor: Avaliar fornecedor")
    print("  - relatorio: Gerar relatório de progresso")
    print("  - sair: Encerrar")
    print("\n" + "=" * 80)
    
    agent = SupplyAIAgent()
    
    while True:
        print("\n")
        comando = input("Comando: ").strip().lower()
        
        if comando == "sair":
            print("\n✅ Até logo! Seus aprendizados foram salvos.")
            break
            
        elif comando == "chat":
            mensagem = input("Sua pergunta: ")
            resposta = agent.chat(mensagem)
            print(f"\n🤖 Agente:\n{resposta}")
            
        elif comando == "decisao":
            decisao = input("Qual decisão você tomou? ")
            contexto = input("Contexto (opcional): ")
            resultado = agent.registrar_decisao(decisao, contexto)
            print(f"\n{resultado}")
            
        elif comando == "insight":
            insight = input("Qual insight você teve? ")
            categoria = input("Categoria (opcional): ") or "geral"
            resultado = agent.adicionar_insight(insight, categoria)
            print(f"\n{resultado}")
            
        elif comando == "projeto":
            nome = input("Nome do projeto: ")
            descricao = input("Descrição (opcional): ")
            print("\n🤖 Analisando projeto...\n")
            resposta = agent.analisar_projeto(nome, descricao)
            print(resposta)
            
        elif comando == "roadmap":
            objetivo = input("Qual objetivo? ")
            prazo = input("Prazo em meses (padrão 12): ")
            prazo = int(prazo) if prazo else 12
            print("\n🤖 Criando roadmap...\n")
            resposta = agent.criar_roadmap(objetivo, prazo)
            print(resposta)
            
        elif comando == "proximos":
            print("\n🤖 Analisando prioridades...\n")
            resposta = agent.sugerir_proximos_passos()
            print(resposta)
            
        elif comando == "explicar":
            conceito = input("Qual conceito? ")
            print(f"\n🤖 Explicando '{conceito}'...\n")
            resposta = agent.explicar_conceito(conceito)
            print(resposta)
            
        elif comando == "fornecedor":
            nome = input("Nome do fornecedor: ")
            servico = input("Serviço oferecido: ")
            proposta = input("Detalhes da proposta (opcional): ")
            print("\n🤖 Avaliando fornecedor...\n")
            resposta = agent.avaliar_fornecedor(nome, servico, proposta)
            print(resposta)
            
        elif comando == "relatorio":
            print("\n🤖 Gerando relatório de progresso...\n")
            resposta = agent.gerar_relatorio_progresso()
            print(resposta)
            
        else:
            print("❌ Comando não reconhecido. Digite um comando válido.")


if __name__ == "__main__":
    main()

