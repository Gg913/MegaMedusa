# app.py
# Para rodar este código, você precisa instalar as bibliotecas Flask e cloudscraper:
# pip install Flask cloudscraper

from flask import Flask, request, jsonify
import cloudscraper
from urllib.parse import quote
import requests # A biblioteca cloudscraper depende da requests

# Inicializa a aplicação Flask
app = Flask(__name__)

# Cria uma instância do cloudscraper. 
# É uma boa prática criar uma instância reutilizável.
scraper = cloudscraper.create_scraper()

@app.route('/api/logs', methods=['GET'])
def get_api_logs():
    """
    Endpoint para buscar e formatar logs de uma URL externa.
    Espera um parâmetro 'url' na query string.
    """
    # 1. Obtém o parâmetro 'url' da query string
    target_url = request.args.get('url')

    # 2. Verifica se o parâmetro 'url' foi fornecido
    if not target_url:
        # Retorna um erro 400 (Bad Request) se o parâmetro estiver faltando
        return jsonify({"error": "Parâmetro 'url' é obrigatório."}), 400

    # 3. Constrói a URL para a API externa
    # A chave 'k' está fixa como 'a123456' conforme especificado.
    # Usamos quote() para garantir que a URL seja codificada corretamente.
    external_api_url = f"https://ulpcloud.site/buscar?q={quote(target_url)}&k=a123456"

    try:
        # 4. Faz uma requisição GET para a API externa usando cloudscraper
        print(f"Buscando em: {external_api_url}")
        response = scraper.get(external_api_url, timeout=15) # Adiciona um timeout

        # Lança uma exceção para respostas com código de erro (4xx ou 5xx)
        response.raise_for_status()

        # 5. Verifica o tipo de conteúdo para garantir que estamos lidando com texto
        content_type = response.headers.get('content-type', '').lower()
        if 'text/plain' not in content_type:
            # Se o tipo de conteúdo não for o esperado, retorna um erro com detalhes
            return jsonify({
                "error": "O tipo de conteúdo da resposta externa não é 'text/plain'.",
                "contentTypeReceived": content_type,
                "partialContent": response.text[:200] if response.text else ''
            }), 400

        # 6. Processa e formata a resposta
        # Usa splitlines() que é mais robusto que split('\n')
        lines = response.text.splitlines()
        parsed_logs = []

        for line in lines:
            trimmed_line = line.strip()  # Remove espaços em branco e quebras de linha
            if trimmed_line:  # Processa apenas linhas não vazias
                if ':' in trimmed_line:
                    # Divide apenas no primeiro ':' para permitir ':' na senha
                    parts = trimmed_line.split(':', 1)
                    login = parts[0].strip()
                    senha = parts[1].strip()  # O resto da linha é a senha
                    parsed_logs.append({"login": login, "senha": senha})
                else:
                    # Adiciona linhas que não estão no formato 'login:senha'
                    parsed_logs.append({"raw_line": trimmed_line})

        # 7. Retorna os logs formatados como JSON com status 200 (OK)
        return jsonify(parsed_logs), 200

    # 8. Manipulação de erros
    except requests.exceptions.HTTPError as http_err:
        # Erros de respostas HTTP com status de erro (4xx, 5xx)
        error_message = f"Erro ao acessar a API externa (Status: {http_err.response.status_code}): {http_err}"
        return jsonify({"error": error_message}), http_err.response.status_code
    except requests.exceptions.RequestException as req_err:
        # Erros de rede (DNS, conexão, timeout, etc.)
        error_message = f"Erro de rede ao acessar a API externa: {req_err}"
        return jsonify({"error": error_message}), 503 # Service Unavailable
    except Exception as e:
        # Outros erros inesperados durante a execução
        return jsonify({"error": f"Ocorreu um erro interno inesperado: {e}"}), 500

# Bloco para permitir a execução direta do script para testes
if __name__ == '__main__':
    # Executa a aplicação em modo de depuração na porta 5000
    # O modo de depuração não deve ser usado em produção!
    app.run(host='0.0.0.0', port=5000, debug=True)
