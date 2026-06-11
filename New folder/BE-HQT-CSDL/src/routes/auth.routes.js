import { Router } from 'express'
import * as authController from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/register', authController.register)
router.post('/login', authController.login)
router.post('/logout', authController.logout)
router.get('/me', authenticate, authController.getMe)
router.patch('/me', authenticate, authController.updateMe)

export default router
