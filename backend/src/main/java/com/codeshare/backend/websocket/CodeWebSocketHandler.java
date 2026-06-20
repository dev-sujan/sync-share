package com.codeshare.backend.websocket;

import com.codeshare.backend.model.Room;
import com.codeshare.backend.repository.RoomRepository;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class CodeWebSocketHandler extends TextWebSocketHandler {

    private final RoomRepository roomRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Map: RoomId -> Set of WebSocketSessions
    private final Map<String, Set<WebSocketSession>> roomSessions = new ConcurrentHashMap<>();

    // Map: SessionId -> RoomId
    private final Map<String, String> sessionRooms = new ConcurrentHashMap<>();

    @Autowired
    public CodeWebSocketHandler(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Map<String, Object> payload = objectMapper.readValue(message.getPayload(), Map.class);
        String type = (String) payload.get("type");
        String roomId = (String) payload.get("roomId");
        String sender = (String) payload.get("sender");
        Object data = payload.get("data");

        if (type == null || roomId == null) {
            return;
        }

        switch (type) {
            case "JOIN":
                handleJoin(session, roomId);
                break;
            case "CODE_CHANGE":
                handleCodeChange(session, roomId, (String) data);
                break;
            case "LANGUAGE_CHANGE":
                handleLanguageChange(session, roomId, (String) data);
                break;
            case "CURSOR_CHANGE":
                broadcastToRoomExceptSender(session, roomId, message);
                break;
            case "CHAT":
                handleChat(session, roomId, sender, (String) data);
                break;
            case "FILE_UPLOADED":
                broadcastToRoomExceptSender(session, roomId, message);
                break;
            default:
                break;
        }
    }

    private void handleJoin(WebSocketSession session, String roomId) throws IOException {
        sessionRooms.put(session.getId(), roomId);
        roomSessions.computeIfAbsent(roomId, k -> new CopyOnWriteArraySet<>()).add(session);

        // Optionally send current room state to the newly joined client
        Optional<Room> roomOpt = roomRepository.findById(roomId);
        if (roomOpt.isPresent()) {
            Room room = roomOpt.get();
            Map<String, Object> syncMsg = new HashMap<>();
            syncMsg.put("type", "SYNC");
            syncMsg.put("roomId", roomId);
            syncMsg.put("data", Map.of(
                "code", room.getCurrentCode(),
                "language", room.getLanguage()
            ));
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(syncMsg)));
        }
    }

    private void handleCodeChange(WebSocketSession senderSession, String roomId, String code) {
        // Update database (optional: throttled, or on disconnect. Let's do a simple save)
        Optional<Room> roomOpt = roomRepository.findById(roomId);
        if (roomOpt.isPresent()) {
            Room room = roomOpt.get();
            room.setCurrentCode(code != null ? code : "");
            roomRepository.save(room);
        }

        // Broadcast to other clients
        Map<String, Object> broadcastMsg = new HashMap<>();
        broadcastMsg.put("type", "CODE_CHANGE");
        broadcastMsg.put("roomId", roomId);
        broadcastMsg.put("sender", senderSession.getId());
        broadcastMsg.put("data", code);

        broadcast(roomId, senderSession, broadcastMsg);
    }

    private void handleLanguageChange(WebSocketSession senderSession, String roomId, String language) {
        Optional<Room> roomOpt = roomRepository.findById(roomId);
        if (roomOpt.isPresent()) {
            Room room = roomOpt.get();
            room.setLanguage(language);
            roomRepository.save(room);
        }

        // Broadcast to other clients
        Map<String, Object> broadcastMsg = new HashMap<>();
        broadcastMsg.put("type", "LANGUAGE_CHANGE");
        broadcastMsg.put("roomId", roomId);
        broadcastMsg.put("sender", senderSession.getId());
        broadcastMsg.put("data", language);

        broadcast(roomId, senderSession, broadcastMsg);
    }

    private void handleChat(WebSocketSession senderSession, String roomId, String sender, String text) {
        Map<String, Object> broadcastMsg = new HashMap<>();
        broadcastMsg.put("type", "CHAT");
        broadcastMsg.put("roomId", roomId);
        broadcastMsg.put("sender", sender);
        broadcastMsg.put("data", text);

        broadcast(roomId, senderSession, broadcastMsg);
    }

    private void broadcastToRoomExceptSender(WebSocketSession senderSession, String roomId, TextMessage message) {
        Set<WebSocketSession> sessions = roomSessions.get(roomId);
        if (sessions != null) {
            for (WebSocketSession s : sessions) {
                if (s.isOpen() && !s.getId().equals(senderSession.getId())) {
                    try {
                        s.sendMessage(message);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }
    }

    private void broadcast(String roomId, WebSocketSession senderSession, Map<String, Object> msgMap) {
        try {
            String json = objectMapper.writeValueAsString(msgMap);
            TextMessage textMessage = new TextMessage(json);
            broadcastToRoomExceptSender(senderSession, roomId, textMessage);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = sessionRooms.remove(session.getId());
        if (roomId != null) {
            Set<WebSocketSession> sessions = roomSessions.get(roomId);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    roomSessions.remove(roomId);
                }
            }
        }
    }
}
