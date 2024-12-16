from langchain.chains import ConversationChain
from langchain_openai import ChatOpenAI
from langchain.memory import ConversationSummaryMemory

def get_chat_response(prompt, menmory, api_key):
    model = ChatOpenAI(model="输入所需调用模型", api_key=api_key)
    chain = ConversationChain(llm=model, menmory=menmory)

    response = chain.invoke({"input": prompt})
    return response["response"]

get_chat_response("")