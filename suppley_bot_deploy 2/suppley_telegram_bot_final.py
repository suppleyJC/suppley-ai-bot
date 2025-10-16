#!/usr/bin/env python3
"""
Suppley AI Telegram Bot - Versão Final
Bot do Telegram integrado com o Suppley AI Agent usando API Manus

Autor: Manus AI
Data: Outubro 2025
Versão: 2.0 (Manus API)
"""

import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes
)
from suppley_ai_agent import SupplyAIAgent

# Configurar logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Instância global do agente
agent = SupplyAIAgent()

# Token do bot (via variável de ambiente)
TELEGRAM_TOKEN = os.getenv('TELEGRAM_TOKEN', '8336628777:AAHNjR3uuQ-iB-Q1brgF_hM7to1bj9xcoxk')

# Mensagem de boas-vindas personalizada
WELCOME_MESSAGE = """🤖 *Suppley AI Assistant*

Olá! Sou seu Head of AI Virtual, programado especificamente para a Suppley Raw Material.

*📊 O que eu sei sobre a Suppley:*
• 6 armazéns estratégicos no Brasil
• Foco em construção civil e indústria
• Produtos: ferro, aço, pregos, escoras, acabamentos
• Grupo: CONTLOG, Seaforte, FST, Tributo Justo

*🎯 Como posso te ajudar:*
• Decisões estratégicas sobre IA
• Análise de projetos e oportunidades
• Criar roadmaps e planos de ação
• Explicar conceitos técnicos de forma prática
• Sugerir próximos passos
• Avaliar fornecedores e propostas

*💡 Como usar:*
• Use os botões abaixo para ações rápidas
• Ou simplesmente converse comigo naturalmente!

Escolha uma opção ou me faça uma pergunta:"""


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /start - Boas-vindas"""
    keyboard = [
        [
            InlineKeyboardButton("📋 Próximos Passos", callback_data='proximos'),
            InlineKeyboardButton("📊 Relatório", callback_data='relatorio')
        ],
        [
            InlineKeyboardButton("🔍 Analisar Projeto", callback_data='projeto'),
            InlineKeyboardButton("🗺️ Criar Roadmap", callback_data='roadmap')
        ],
        [
            InlineKeyboardButton("💡 Explicar Conceito", callback_data='explicar'),
            InlineKeyboardButton("❓ Ajuda", callback_data='ajuda')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        WELCOME_MESSAGE,
        parse_mode='Markdown',
        reply_markup=reply_markup
    )


async def proximos_passos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /proximos - Sugerir próximos passos"""
    query = update.callback_query if update.callback_query else None
    
    if query:
        await query.answer()
        await query.message.reply_text("🔄 Analisando prioridades...")
    else:
        await update.message.reply_text("🔄 Analisando prioridades...")
    
    try:
        resposta = agent.sugerir_proximos_passos()
        
        if query:
            await send_long_message(query.message, resposta)
        else:
            await send_long_message(update.message, resposta)
    except Exception as e:
        logger.error(f"Erro em proximos_passos: {e}")
        error_msg = "❌ Ocorreu um erro ao gerar os próximos passos. Tente novamente."
        if query:
            await query.message.reply_text(error_msg)
        else:
            await update.message.reply_text(error_msg)


async def relatorio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /relatorio - Gerar relatório de progresso"""
    query = update.callback_query if update.callback_query else None
    
    if query:
        await query.answer()
        await query.message.reply_text("📊 Gerando relatório...")
    else:
        await update.message.reply_text("📊 Gerando relatório...")
    
    try:
        resposta = agent.gerar_relatorio_progresso()
        
        if query:
            await send_long_message(query.message, resposta)
        else:
            await send_long_message(update.message, resposta)
    except Exception as e:
        logger.error(f"Erro em relatorio: {e}")
        error_msg = "❌ Ocorreu um erro ao gerar o relatório. Tente novamente."
        if query:
            await query.message.reply_text(error_msg)
        else:
            await update.message.reply_text(error_msg)


async def projeto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /projeto - Analisar projeto"""
    query = update.callback_query if update.callback_query else None
    
    # Se veio dos botões, pedir nome do projeto
    if query:
        await query.answer()
        await query.message.reply_text(
            "🔍 *Análise de Projeto*\n\n"
            "Digite o nome e descrição do projeto que deseja analisar.\n\n"
            "*Exemplo:*\n"
            "`Escoras Metálicas Inteligentes - Escoras com sensores IoT`",
            parse_mode='Markdown'
        )
        context.user_data['waiting_for'] = 'projeto'
        return
    
    # Se veio do comando
    if not context.args:
        await update.message.reply_text(
            "Por favor, informe o nome do projeto.\n\n"
            "*Exemplo:* `/projeto Escoras Inteligentes`",
            parse_mode='Markdown'
        )
        return
    
    nome_projeto = ' '.join(context.args)
    await update.message.reply_text(f"🔍 Analisando projeto: *{nome_projeto}*...", parse_mode='Markdown')
    
    try:
        resposta = agent.analisar_projeto(nome_projeto)
        await send_long_message(update.message, resposta)
    except Exception as e:
        logger.error(f"Erro em projeto: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao analisar o projeto. Tente novamente.")


async def roadmap(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /roadmap - Criar roadmap"""
    query = update.callback_query if update.callback_query else None
    
    if query:
        await query.answer()
        await query.message.reply_text(
            "🗺️ *Criar Roadmap*\n\n"
            "Digite o objetivo e prazo (em meses).\n\n"
            "*Exemplo:*\n"
            "`Lançar marketplace inteligente - 12 meses`",
            parse_mode='Markdown'
        )
        context.user_data['waiting_for'] = 'roadmap'
        return
    
    if not context.args:
        await update.message.reply_text(
            "Por favor, informe o objetivo.\n\n"
            "*Exemplo:* `/roadmap Lançar escoras inteligentes`",
            parse_mode='Markdown'
        )
        return
    
    objetivo = ' '.join(context.args)
    await update.message.reply_text(f"🗺️ Criando roadmap para: *{objetivo}*...", parse_mode='Markdown')
    
    try:
        resposta = agent.criar_roadmap(objetivo)
        await send_long_message(update.message, resposta)
    except Exception as e:
        logger.error(f"Erro em roadmap: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao criar o roadmap. Tente novamente.")


async def explicar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /explicar - Explicar conceito"""
    query = update.callback_query if update.callback_query else None
    
    if query:
        await query.answer()
        await query.message.reply_text(
            "💡 *Explicar Conceito*\n\n"
            "Digite o conceito que deseja entender.\n\n"
            "*Exemplos:*\n"
            "• `Machine Learning`\n"
            "• `Digital Twin`\n"
            "• `IoT`",
            parse_mode='Markdown'
        )
        context.user_data['waiting_for'] = 'explicar'
        return
    
    if not context.args:
        await update.message.reply_text(
            "Por favor, informe o conceito.\n\n"
            "*Exemplo:* `/explicar Machine Learning`",
            parse_mode='Markdown'
        )
        return
    
    conceito = ' '.join(context.args)
    await update.message.reply_text(f"💡 Explicando: *{conceito}*...", parse_mode='Markdown')
    
    try:
        resposta = agent.explicar_conceito(conceito)
        await send_long_message(update.message, resposta)
    except Exception as e:
        logger.error(f"Erro em explicar: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao explicar o conceito. Tente novamente.")


async def decisao(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /decisao - Registrar decisão"""
    if not context.args:
        await update.message.reply_text(
            "Por favor, descreva a decisão.\n\n"
            "*Exemplo:* `/decisao Vou começar com escoras inteligentes`",
            parse_mode='Markdown'
        )
        return
    
    decisao_texto = ' '.join(context.args)
    
    try:
        resultado = agent.registrar_decisao(decisao_texto)
        
        await update.message.reply_text(
            f"✅ *Decisão Registrada!*\n\n_{decisao_texto}_\n\n"
            "Vou considerar isso nas próximas recomendações.",
            parse_mode='Markdown'
        )
    except Exception as e:
        logger.error(f"Erro em decisao: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao registrar a decisão. Tente novamente.")


async def insight(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /insight - Adicionar insight"""
    if not context.args:
        await update.message.reply_text(
            "Por favor, descreva o insight.\n\n"
            "*Exemplo:* `/insight Clientes de SP preferem produtos certificados`",
            parse_mode='Markdown'
        )
        return
    
    insight_texto = ' '.join(context.args)
    
    try:
        resultado = agent.adicionar_insight(insight_texto)
        
        await update.message.reply_text(
            f"💡 *Insight Registrado!*\n\n_{insight_texto}_\n\n"
            "Vou usar isso para personalizar minhas recomendações.",
            parse_mode='Markdown'
        )
    except Exception as e:
        logger.error(f"Erro em insight: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao registrar o insight. Tente novamente.")


async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /ajuda - Mostrar ajuda"""
    query = update.callback_query if update.callback_query else None
    
    help_text = """📖 *Comandos Disponíveis*

*Análise e Planejamento:*
/proximos - Próximos passos recomendados
/projeto [nome] - Analisar um projeto
/roadmap [objetivo] - Criar roadmap
/relatorio - Relatório de progresso

*Aprendizado:*
/explicar [conceito] - Explicar conceito de IA
/decisao [texto] - Registrar decisão
/insight [texto] - Adicionar insight

*Outros:*
/start - Reiniciar conversa
/ajuda - Mostrar esta mensagem

*💬 Conversa Natural:*
Você também pode simplesmente conversar comigo!
Faça qualquer pergunta sobre estratégia de IA.

*Exemplos:*
• "Quanto custa implementar escoras inteligentes?"
• "Como devo priorizar meus projetos?"
• "Qual a melhor forma de começar com IA?"
• "Me ajuda a decidir entre marketplace e escoras?"
"""
    
    if query:
        await query.answer()
        await query.message.reply_text(help_text, parse_mode='Markdown')
    else:
        await update.message.reply_text(help_text, parse_mode='Markdown')


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Processar mensagens de texto (conversação natural)"""
    user_message = update.message.text
    
    # Verificar se está esperando input específico
    waiting_for = context.user_data.get('waiting_for')
    
    try:
        if waiting_for == 'projeto':
            await update.message.reply_text("🔍 Analisando projeto...")
            resposta = agent.analisar_projeto(user_message)
            context.user_data['waiting_for'] = None
            
        elif waiting_for == 'roadmap':
            await update.message.reply_text("🗺️ Criando roadmap...")
            # Extrair prazo se mencionado
            prazo = 12  # padrão
            if '-' in user_message:
                parts = user_message.split('-')
                objetivo = parts[0].strip()
                try:
                    prazo = int(''.join(filter(str.isdigit, parts[1])))
                except:
                    prazo = 12
            else:
                objetivo = user_message
            
            resposta = agent.criar_roadmap(objetivo, prazo)
            context.user_data['waiting_for'] = None
            
        elif waiting_for == 'explicar':
            await update.message.reply_text("💡 Explicando...")
            resposta = agent.explicar_conceito(user_message)
            context.user_data['waiting_for'] = None
            
        else:
            # Conversação natural
            await update.message.reply_text("🤔 Pensando...")
            resposta = agent.chat(user_message)
        
        await send_long_message(update.message, resposta)
        
    except Exception as e:
        logger.error(f"Erro em handle_message: {e}")
        await update.message.reply_text(
            "❌ Desculpe, ocorreu um erro ao processar sua mensagem. "
            "Tente reformular ou use /ajuda para ver os comandos disponíveis."
        )


async def send_long_message(message, text, parse_mode='Markdown'):
    """Envia mensagem longa dividindo em chunks se necessário"""
    # Telegram tem limite de 4096 caracteres
    max_length = 4000
    
    if len(text) <= max_length:
        try:
            await message.reply_text(text, parse_mode=parse_mode)
        except:
            # Se falhar com Markdown, tenta sem formatação
            await message.reply_text(text)
    else:
        # Dividir em chunks
        chunks = []
        current_chunk = ""
        
        for line in text.split('\n'):
            if len(current_chunk) + len(line) + 1 <= max_length:
                current_chunk += line + '\n'
            else:
                chunks.append(current_chunk)
                current_chunk = line + '\n'
        
        if current_chunk:
            chunks.append(current_chunk)
        
        # Enviar chunks
        for i, chunk in enumerate(chunks):
            try:
                if i == 0:
                    await message.reply_text(chunk, parse_mode=parse_mode)
                else:
                    await message.reply_text(f"_(continuação {i})_\n\n{chunk}", parse_mode=parse_mode)
            except:
                # Se falhar com Markdown, tenta sem formatação
                await message.reply_text(chunk)


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Processar cliques nos botões"""
    query = update.callback_query
    
    if query.data == 'proximos':
        await proximos_passos(update, context)
    elif query.data == 'relatorio':
        await relatorio(update, context)
    elif query.data == 'projeto':
        await projeto(update, context)
    elif query.data == 'roadmap':
        await roadmap(update, context)
    elif query.data == 'explicar':
        await explicar(update, context)
    elif query.data == 'ajuda':
        await ajuda(update, context)


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Tratar erros"""
    logger.error(f"Erro: {context.error}")
    
    if update and update.message:
        await update.message.reply_text(
            "❌ Desculpe, ocorreu um erro inesperado. "
            "Tente novamente ou use /ajuda para ver os comandos disponíveis."
        )


def main():
    """Função principal"""
    logger.info("🤖 Iniciando Suppley AI Telegram Bot...")
    
    # Verificar token
    if not TELEGRAM_TOKEN or TELEGRAM_TOKEN == 'SEU_TOKEN_AQUI':
        logger.error("❌ TELEGRAM_TOKEN não configurado!")
        return
    
    # Criar aplicação
    application = Application.builder().token(TELEGRAM_TOKEN).build()
    
    # Registrar handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("proximos", proximos_passos))
    application.add_handler(CommandHandler("relatorio", relatorio))
    application.add_handler(CommandHandler("projeto", projeto))
    application.add_handler(CommandHandler("roadmap", roadmap))
    application.add_handler(CommandHandler("explicar", explicar))
    application.add_handler(CommandHandler("decisao", decisao))
    application.add_handler(CommandHandler("insight", insight))
    application.add_handler(CommandHandler("ajuda", ajuda))
    
    # Handler para botões
    application.add_handler(CallbackQueryHandler(button_callback))
    
    # Handler para mensagens de texto
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    # Handler de erros
    application.add_error_handler(error_handler)
    
    # Iniciar bot
    logger.info("✅ Suppley AI Telegram Bot iniciado com sucesso!")
    logger.info(f"📱 Bot disponível em: t.me/suppley_ai_bot")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()

